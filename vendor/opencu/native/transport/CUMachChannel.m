#import "CUMachChannel.h"
#import <bsm/libbsm.h>
#import <dispatch/dispatch.h>
#import <os/lock.h>
#import <servers/bootstrap.h>
#include <math.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

NSErrorDomain const CUMachChannelErrorDomain = @"io.opencu.mach-channel";
const NSUInteger CUMachChannelMaximumJSONBytes = 64 * 1024;
const NSUInteger CUMachChannelMaximumInFlight = 64;

static const uint32_t CUWireMagic = 0x43554D43;
static const uint32_t CUWireVersion = 1;
static const mach_msg_id_t CUMessageID = 0x43554D43;
static const NSTimeInterval CUMaximumTimeout = 300;
static const NSString *CUServicePrefix = @"io.opencu.channel.";

typedef NS_ENUM(uint32_t, CUMessageKind) { CUMessageRequest = 1, CUMessageReply = 2 };

#pragma pack(push, 4)
typedef struct {
    uint32_t magic;
    uint32_t version;
    uint32_t kind;
    uint32_t jsonLength;
    uint32_t timeoutMilliseconds;
    uint8_t nonce[32];
    uuid_t requestID;
} CUWireHeader;
#pragma pack(pop)

static size_t CURoundMessage(size_t size) { return (size + 3U) & ~(size_t)3U; }
static size_t CUMaximumMessageSize(void) {
    return CURoundMessage(sizeof(mach_msg_header_t) + sizeof(mach_msg_body_t) +
                          sizeof(mach_msg_port_descriptor_t) + sizeof(CUWireHeader) +
                          CUMachChannelMaximumJSONBytes);
}

static NSError *CUError(CUMachChannelError code, NSString *message, kern_return_t result) {
    NSMutableDictionary *info = [@{NSLocalizedDescriptionKey: message} mutableCopy];
    if (result != KERN_SUCCESS) info[@"machResult"] = @(result);
    return [NSError errorWithDomain:CUMachChannelErrorDomain code:code userInfo:info];
}

static void CUComplete(CUMachCompletion completion, NSDictionary *metadata,
                       CUMachSendRight *right, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{ completion(metadata, right, error); });
}

NSData *CUMachCreateNonce(void) {
    uint8_t bytes[32];
    arc4random_buf(bytes, sizeof(bytes));
    return [NSData dataWithBytes:bytes length:sizeof(bytes)];
}

NSDictionary<NSString *, NSNumber *> *CUMachCurrentProcessIdentity(NSError **error) {
    audit_token_t token = INVALID_AUDIT_TOKEN_VALUE;
    mach_msg_type_number_t count = TASK_AUDIT_TOKEN_COUNT;
    kern_return_t result = task_info(mach_task_self(), TASK_AUDIT_TOKEN, (task_info_t)&token, &count);
    if (result != KERN_SUCCESS || count != TASK_AUDIT_TOKEN_COUNT || audit_token_to_pid(token) <= 0 ||
        audit_token_to_pidversion(token) <= 0) {
        if (error) *error = CUError(CUMachChannelErrorTransport, @"Could not read the calling task's kernel audit identity", result);
        return nil;
    }
    return @{@"pid": @(audit_token_to_pid(token)), @"euid": @(audit_token_to_euid(token)),
             @"pidVersion": @(audit_token_to_pidversion(token))};
}

@interface CUMachSendRight () {
    os_unfair_lock _lock;
    mach_port_t _ownedPort;
}
- (instancetype)initWithOwnedPort:(mach_port_t)port;
@end

@implementation CUMachSendRight
- (instancetype)initWithOwnedPort:(mach_port_t)port {
    self = [super init];
    if (self) { _lock = OS_UNFAIR_LOCK_INIT; _ownedPort = port; }
    return self;
}
+ (instancetype)retainedSendRightWithPort:(mach_port_t)port error:(NSError **)error {
    if (!MACH_PORT_VALID(port)) {
        if (error) *error = CUError(CUMachChannelErrorTransport, @"A real Mach send right is required", KERN_INVALID_RIGHT);
        return nil;
    }
    kern_return_t result = mach_port_mod_refs(mach_task_self(), port, MACH_PORT_RIGHT_SEND, 1);
    if (result != KERN_SUCCESS) {
        if (error) *error = CUError(CUMachChannelErrorTransport, @"Could not retain the Mach send right", result);
        return nil;
    }
    return [[self alloc] initWithOwnedPort:port];
}
- (mach_port_t)port {
    os_unfair_lock_lock(&_lock);
    mach_port_t port = _ownedPort;
    os_unfair_lock_unlock(&_lock);
    return port;
}
- (mach_port_t)copySendRightWithError:(NSError **)error {
    os_unfair_lock_lock(&_lock);
    mach_port_t port = _ownedPort;
    kern_return_t result = MACH_PORT_VALID(port)
        ? mach_port_mod_refs(mach_task_self(), port, MACH_PORT_RIGHT_SEND, 1) : KERN_INVALID_RIGHT;
    os_unfair_lock_unlock(&_lock);
    if (result != KERN_SUCCESS) {
        if (error) *error = CUError(CUMachChannelErrorTransport, @"The Mach send right is no longer available", result);
        return MACH_PORT_NULL;
    }
    return port;
}
- (void)invalidate {
    os_unfair_lock_lock(&_lock);
    mach_port_t port = _ownedPort;
    _ownedPort = MACH_PORT_NULL;
    os_unfair_lock_unlock(&_lock);
    if (MACH_PORT_VALID(port)) (void)mach_port_deallocate(mach_task_self(), port);
}
- (void)dealloc { [self invalidate]; }
@end

@interface CUMachRequest ()
@property(nonatomic, readwrite, copy) NSString *requestID;
@property(nonatomic, readwrite, copy) NSString *operation;
@property(nonatomic, readwrite, copy) NSDictionary *metadata;
@property(nonatomic, readwrite) CUMachSendRight *sendRight;
@property(nonatomic, readwrite) pid_t peerPID;
@property(nonatomic, readwrite) uid_t peerEUID;
@property(nonatomic, readwrite) int peerPIDVersion;
- (instancetype)initPrivate;
@end
@implementation CUMachRequest
- (instancetype)initPrivate { return [super init]; }
@end

@class CUChannelState;
@interface CUReplyContext : NSObject {
@public
    atomic_bool _active;
}
@property(nonatomic, weak) CUChannelState *state;
@property(nonatomic, copy) NSString *requestID;
@property(nonatomic, copy) NSString *operation;
@property(nonatomic) CUMachSendRight *replyRight;
@property(atomic) CUMachRequest *request;
@property(nonatomic) dispatch_source_t deadline;
@end
@implementation CUReplyContext
- (instancetype)init {
    self = [super init];
    if (self) atomic_init(&_active, true);
    return self;
}
- (void)dealloc { if (_deadline) dispatch_source_cancel(_deadline); }
@end

@interface CUPendingRequest : NSObject
@property(nonatomic, copy) NSString *operation;
@property(nonatomic, copy) CUMachCompletion completion;
@property(nonatomic) dispatch_source_t deadline;
@property(nonatomic) BOOL completed;
@end
@implementation CUPendingRequest
- (void)dealloc { if (_deadline) dispatch_source_cancel(_deadline); }
@end

@interface CUChannelState : NSObject
@property(nonatomic) dispatch_queue_t queue;
@property(nonatomic, copy) NSString *serviceName;
@property(nonatomic, copy) NSData *nonce;
@property(nonatomic, copy) NSSet<NSString *> *allowedOperations;
@property(nonatomic) pid_t expectedPID;
@property(nonatomic) uid_t expectedEUID;
@property(nonatomic) int expectedPIDVersion;
@property(nonatomic) NSUInteger maxInFlight;
@property(nonatomic) BOOL listener;
@property(nonatomic) BOOL started;
@property(nonatomic) BOOL closed;
@property(nonatomic) BOOL registered;
@property(nonatomic) mach_port_t receivePort;
@property(nonatomic) dispatch_source_t receiveSource;
@property(nonatomic) dispatch_source_t deathSource;
@property(nonatomic) CUMachSendRight *peerSendRight;
@property(nonatomic, copy) CUMachRequestHandler handler;
@property(nonatomic, copy) CUMachErrorHandler errorHandler;
@property(nonatomic) NSMutableDictionary<NSString *, CUPendingRequest *> *pending;
@property(nonatomic) NSMutableDictionary<NSString *, CUReplyContext *> *replies;
@property(nonatomic) NSMutableSet<NSString *> *seenIDs;
@property(nonatomic) NSMutableArray<NSString *> *seenOrder;
- (void)start:(CUMachStartCompletion)completion;
- (void)close;
- (void)shutdown:(NSError *)error report:(BOOL)report;
- (void)completePending:(NSString *)requestID metadata:(NSDictionary *)metadata
             sendRight:(CUMachSendRight *)right error:(NSError *)error;
- (void)drainMessages;
- (void)replyToContext:(CUReplyContext *)context metadata:(NSDictionary *)metadata
            sendRight:(CUMachSendRight *)right error:(NSError *)error;
- (void)sendOperation:(NSString *)operation data:(NSData *)data sendRight:(CUMachSendRight *)right
              timeout:(NSTimeInterval)timeout completion:(CUMachCompletion)completion;
@end

static BOOL CUValidOperation(NSString *operation) {
    return [operation isKindOfClass:NSString.class] && operation.length > 0 &&
           [operation lengthOfBytesUsingEncoding:NSUTF8StringEncoding] <= 128;
}

static BOOL CUValidConfiguration(pid_t pid, int pidVersion, NSData *nonce,
                                 NSSet<NSString *> *operations, NSUInteger limit, NSError **error) {
    BOOL valid = pid > 0 && pidVersion >= 0 && [nonce isKindOfClass:NSData.class] && nonce.length == 32 &&
                 [operations isKindOfClass:NSSet.class] && operations.count > 0 && operations.count <= 128 &&
                 limit > 0 && limit <= CUMachChannelMaximumInFlight;
    if (valid) for (id operation in operations) if (!CUValidOperation(operation)) { valid = NO; break; }
    if (!valid && error) *error = CUError(CUMachChannelErrorInvalidConfiguration,
        @"Expected PID, PID version, 32-byte nonce, operation allowlist and bounded capacity are required", KERN_SUCCESS);
    return valid;
}

static NSData *CUEncodeEnvelope(NSString *operation, NSDictionary *metadata, NSError *remoteError,
                                NSError **error) {
    if (!CUValidOperation(operation) || (metadata && ![metadata isKindOfClass:NSDictionary.class])) {
        if (error) *error = CUError(CUMachChannelErrorProtocol, @"Invalid operation or metadata object", KERN_SUCCESS);
        return nil;
    }
    NSMutableDictionary *envelope = [@{@"operation": operation, @"metadata": metadata ?: @{}} mutableCopy];
    if (remoteError) {
        NSString *message = remoteError.localizedDescription ?: @"Remote operation failed";
        if (message.length > 512) message = [message substringToIndex:512];
        envelope[@"error"] = @{@"domain": remoteError.domain, @"code": @(remoteError.code), @"message": message};
    }
    if (![NSJSONSerialization isValidJSONObject:envelope]) {
        if (error) *error = CUError(CUMachChannelErrorProtocol, @"Metadata must contain JSON values", KERN_SUCCESS);
        return nil;
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:envelope options:0 error:error];
    if (data.length > CUMachChannelMaximumJSONBytes) {
        if (error) *error = CUError(CUMachChannelErrorProtocol, @"JSON metadata exceeds 64 KiB", KERN_SUCCESS);
        return nil;
    }
    return data;
}

// Only successful kernel receives reach this function. Walk the descriptor table
// before invoking the unbounded libmach destructor, including rejected OOL types.
static BOOL CUReceivedLayoutIsSafe(mach_msg_header_t *header, size_t capacity) {
    if (header->msgh_size < sizeof(*header) || header->msgh_size > capacity) return NO;
    if (!(header->msgh_bits & MACH_MSGH_BITS_COMPLEX)) return YES;
    size_t offset = sizeof(*header);
    if (header->msgh_size - offset < sizeof(mach_msg_body_t)) return NO;
    mach_msg_body_t body;
    memcpy(&body, (uint8_t *)header + offset, sizeof(body));
    offset += sizeof(body);
    if (body.msgh_descriptor_count > (header->msgh_size - offset) / sizeof(mach_msg_type_descriptor_t)) return NO;
    for (mach_msg_size_t i = 0; i < body.msgh_descriptor_count; i++) {
        if (header->msgh_size - offset < sizeof(mach_msg_type_descriptor_t)) return NO;
        mach_msg_type_descriptor_t descriptor;
        memcpy(&descriptor, (uint8_t *)header + offset, sizeof(descriptor));
        size_t size;
        switch (descriptor.type) {
            case MACH_MSG_PORT_DESCRIPTOR: size = sizeof(mach_msg_port_descriptor_t); break;
            case MACH_MSG_OOL_DESCRIPTOR:
            case MACH_MSG_OOL_VOLATILE_DESCRIPTOR: size = sizeof(mach_msg_ool_descriptor_t); break;
            case MACH_MSG_OOL_PORTS_DESCRIPTOR: size = sizeof(mach_msg_ool_ports_descriptor_t); break;
            case MACH_MSG_GUARDED_PORT_DESCRIPTOR: size = sizeof(mach_msg_guarded_port_descriptor_t); break;
            default: return NO;
        }
        if (size > header->msgh_size - offset) return NO;
        offset += size;
    }
    return YES;
}

static void CUDestroyReceived(mach_msg_header_t *header, size_t capacity) {
    if (CUReceivedLayoutIsSafe(header, capacity)) mach_msg_destroy(header);
}

static BOOL CURecoverableSendError(kern_return_t result) {
    kern_return_t base = result & ~MACH_MSG_MASK;
    return base == MACH_SEND_INVALID_DEST || base == MACH_SEND_TIMED_OUT || base == MACH_SEND_INTERRUPTED;
}

// COPY_SEND preserves our separately owned source references. A timed-out send
// can pseudo-receive extra MOVE_SEND references, which must be destroyed too.
static void CUDestroyUnsent(mach_msg_header_t *header) {
    mach_msg_type_name_t localType = MACH_MSGH_BITS_LOCAL(header->msgh_bits);
    if (MACH_PORT_VALID(header->msgh_local_port) &&
        (localType == MACH_MSG_TYPE_MOVE_SEND || localType == MACH_MSG_TYPE_MOVE_SEND_ONCE)) {
        (void)mach_port_deallocate(mach_task_self(), header->msgh_local_port);
        header->msgh_local_port = MACH_PORT_NULL;
    }
    mach_msg_destroy(header);
}

static NSError *CUSend(CUMachSendRight *destination, mach_port_t replyPort,
                       CUMessageKind kind, NSUUID *requestID, NSData *nonce,
                       NSData *json, uint32_t timeoutMilliseconds, CUMachSendRight *attachment) {
    NSError *error = nil;
    mach_port_t destinationPort = [destination copySendRightWithError:&error];
    if (!MACH_PORT_VALID(destinationPort)) return error;
    mach_port_t attachedPort = MACH_PORT_NULL;
    if (attachment) {
        attachedPort = [attachment copySendRightWithError:&error];
        if (!MACH_PORT_VALID(attachedPort)) {
            (void)mach_port_deallocate(mach_task_self(), destinationPort);
            return error;
        }
    }
    size_t prefix = sizeof(mach_msg_header_t) + (attachment ? sizeof(mach_msg_body_t) + sizeof(mach_msg_port_descriptor_t) : 0);
    size_t messageSize = CURoundMessage(prefix + sizeof(CUWireHeader) + json.length);
    NSMutableData *message = [NSMutableData dataWithLength:messageSize];
    mach_msg_header_t *header = message.mutableBytes;
    header->msgh_bits = MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND, replyPort == MACH_PORT_NULL ? 0 : MACH_MSG_TYPE_MAKE_SEND);
    header->msgh_remote_port = destinationPort;
    header->msgh_local_port = replyPort;
    header->msgh_size = (mach_msg_size_t)messageSize;
    header->msgh_id = CUMessageID;
    if (attachment) {
        header->msgh_bits |= MACH_MSGH_BITS_COMPLEX;
        mach_msg_body_t *body = (void *)((uint8_t *)header + sizeof(*header));
        body->msgh_descriptor_count = 1;
        mach_msg_port_descriptor_t *descriptor = (void *)(body + 1);
        descriptor->name = attachedPort;
        descriptor->disposition = MACH_MSG_TYPE_COPY_SEND;
        descriptor->type = MACH_MSG_PORT_DESCRIPTOR;
    }
    CUWireHeader wire = {.magic = CUWireMagic, .version = CUWireVersion, .kind = kind,
                         .jsonLength = (uint32_t)json.length, .timeoutMilliseconds = timeoutMilliseconds};
    memcpy(wire.nonce, nonce.bytes, sizeof(wire.nonce));
    [requestID getUUIDBytes:wire.requestID];
    memcpy((uint8_t *)header + prefix, &wire, sizeof(wire));
    memcpy((uint8_t *)header + prefix + sizeof(wire), json.bytes, json.length);
    kern_return_t result = mach_msg(header, MACH_SEND_MSG | MACH_SEND_TIMEOUT | MACH_SEND_INTERRUPT,
                                    header->msgh_size, 0, MACH_PORT_NULL, 0, MACH_PORT_NULL);
    if (CURecoverableSendError(result)) CUDestroyUnsent(header);
    (void)mach_port_deallocate(mach_task_self(), destinationPort);
    if (MACH_PORT_VALID(attachedPort)) (void)mach_port_deallocate(mach_task_self(), attachedPort);
    if (result != MACH_MSG_SUCCESS) return CUError(CUMachChannelErrorTransport, @"Mach message send failed; operation was not replayed", result);
    return nil;
}

@implementation CUChannelState
- (instancetype)init {
    self = [super init];
    if (self) {
        _queue = dispatch_queue_create("io.opencu.mach-channel.io", DISPATCH_QUEUE_SERIAL);
        _pending = [NSMutableDictionary dictionary];
        _replies = [NSMutableDictionary dictionary];
        _seenIDs = [NSMutableSet set];
        _seenOrder = [NSMutableArray array];
    }
    return self;
}
- (void)reportError:(NSError *)error {
    CUMachErrorHandler handler = self.errorHandler;
    if (handler) dispatch_async(dispatch_get_main_queue(), ^{ handler(error); });
}
- (BOOL)installDeathSource:(CUMachSendRight *)right {
    dispatch_source_t source = dispatch_source_create(DISPATCH_SOURCE_TYPE_MACH_SEND, right.port,
                                                      DISPATCH_MACH_SEND_DEAD, self.queue);
    if (!source) return NO;
    __weak CUChannelState *weakSelf = self;
    dispatch_source_set_event_handler(source, ^{
        [weakSelf shutdown:CUError(CUMachChannelErrorTransport, @"The peer Mach message port died", KERN_INVALID_RIGHT) report:YES];
    });
    // The observed name cannot be recycled before dispatch has removed its watch.
    dispatch_source_set_cancel_handler(source, ^{ [right invalidate]; });
    self.peerSendRight = right;
    self.deathSource = source;
    dispatch_resume(source);
    return YES;
}
- (NSError *)installReceivePort {
    mach_port_t port = MACH_PORT_NULL;
    kern_return_t result = mach_port_allocate(mach_task_self(), MACH_PORT_RIGHT_RECEIVE, &port);
    if (result != KERN_SUCCESS) return CUError(CUMachChannelErrorTransport, @"Could not allocate Mach receive port", result);
    dispatch_source_t source = dispatch_source_create(DISPATCH_SOURCE_TYPE_MACH_RECV, port, 0, self.queue);
    if (!source) {
        (void)mach_port_mod_refs(mach_task_self(), port, MACH_PORT_RIGHT_RECEIVE, -1);
        return CUError(CUMachChannelErrorTransport, @"Could not create Mach receive source", KERN_RESOURCE_SHORTAGE);
    }
    self.receivePort = port;
    self.receiveSource = source;
    __weak CUChannelState *weakSelf = self;
    dispatch_source_set_event_handler(source, ^{ [weakSelf drainMessages]; });
    dispatch_source_set_cancel_handler(source, ^{
        (void)mach_port_mod_refs(mach_task_self(), port, MACH_PORT_RIGHT_RECEIVE, -1);
    });
    dispatch_resume(source);
    return nil;
}
- (void)start:(CUMachStartCompletion)completion {
    dispatch_async(self.queue, ^{
        NSError *error = nil;
        if (self.closed) error = CUError(CUMachChannelErrorClosed, @"Mach channel is closed", KERN_SUCCESS);
        else if (!self.started) {
            error = [self installReceivePort];
            if (!error && self.listener) {
                kern_return_t result = mach_port_insert_right(mach_task_self(), self.receivePort,
                                                              self.receivePort, MACH_MSG_TYPE_MAKE_SEND);
                if (result == KERN_SUCCESS) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
                    result = bootstrap_register(bootstrap_port, (char *)self.serviceName.UTF8String, self.receivePort);
#pragma clang diagnostic pop
                    (void)mach_port_deallocate(mach_task_self(), self.receivePort);
                }
                if (result == KERN_SUCCESS) self.registered = YES;
                else error = CUError(CUMachChannelErrorBootstrap,
                    [NSString stringWithFormat:@"Dynamic bootstrap registration failed (%s); no service was installed", bootstrap_strerror(result)], result);
            } else if (!error) {
                mach_port_t port = MACH_PORT_NULL;
                kern_return_t result = bootstrap_look_up(bootstrap_port, self.serviceName.UTF8String, &port);
                if (result != KERN_SUCCESS) error = CUError(CUMachChannelErrorBootstrap,
                    [NSString stringWithFormat:@"Dynamic bootstrap lookup failed (%s)", bootstrap_strerror(result)], result);
                else {
                    CUMachSendRight *right = [[CUMachSendRight alloc] initWithOwnedPort:port];
                    if (![self installDeathSource:right]) error = CUError(CUMachChannelErrorTransport, @"Could not observe peer port death", KERN_RESOURCE_SHORTAGE);
                }
            }
            if (error) [self shutdown:error report:NO];
            else self.started = YES;
        }
        dispatch_async(dispatch_get_main_queue(), ^{ completion(error); });
    });
}
- (void)finishContext:(CUReplyContext *)context {
    atomic_store(&context->_active, false);
    if (context.deadline) dispatch_source_cancel(context.deadline);
    context.deadline = nil;
    [context.replyRight invalidate];
    context.replyRight = nil;
    context.request = nil;
    [self.replies removeObjectForKey:context.requestID];
}
- (void)completePending:(NSString *)requestID metadata:(NSDictionary *)metadata
             sendRight:(CUMachSendRight *)right error:(NSError *)error {
    CUPendingRequest *pending = self.pending[requestID];
    if (!pending || pending.completed) return;
    pending.completed = YES;
    if (pending.deadline) dispatch_source_cancel(pending.deadline);
    pending.deadline = nil;
    // Keep the capacity slot until the main queue can consume this completion.
    __weak CUChannelState *weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
        CUChannelState *state = weakSelf;
        if (state) dispatch_async(state.queue, ^{
            if (state.pending[requestID] == pending) [state.pending removeObjectForKey:requestID];
        });
        pending.completion(metadata, right, error);
    });
}
- (void)shutdown:(NSError *)error report:(BOOL)report {
    if (self.closed) return;
    self.closed = YES;
    self.started = NO;
    if (self.registered) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        kern_return_t result = bootstrap_register(bootstrap_port, (char *)self.serviceName.UTF8String, MACH_PORT_NULL);
#pragma clang diagnostic pop
        self.registered = NO;
        if (result != KERN_SUCCESS) [self reportError:CUError(CUMachChannelErrorBootstrap,
            @"Dynamic bootstrap unregister failed; the receive right will still be destroyed", result)];
    }
    if (self.receiveSource) dispatch_source_cancel(self.receiveSource);
    self.receiveSource = nil;
    self.receivePort = MACH_PORT_NULL;
    if (self.deathSource) dispatch_source_cancel(self.deathSource);
    self.deathSource = nil;
    self.peerSendRight = nil;
    for (CUReplyContext *context in self.replies.allValues) [self finishContext:context];
    for (NSString *requestID in self.pending.allKeys) [self completePending:requestID metadata:nil sendRight:nil error:error];
    [self.pending removeAllObjects];
    self.handler = nil;
    if (report) [self reportError:error];
}
- (void)close {
    dispatch_async(self.queue, ^{
        [self shutdown:CUError(CUMachChannelErrorClosed, @"Mach channel was closed", KERN_SUCCESS) report:NO];
    });
}
- (BOOL)validateAudit:(audit_token_t)token nonce:(const uint8_t *)nonce {
    if (audit_token_to_pid(token) != self.expectedPID || audit_token_to_euid(token) != self.expectedEUID) return NO;
    const uint8_t *expectedNonce = self.nonce.bytes;
    uint8_t difference = 0;
    for (NSUInteger i = 0; i < 32; i++) difference |= nonce[i] ^ expectedNonce[i];
    if (difference != 0) return NO;
    int version = audit_token_to_pidversion(token);
    if (version <= 0 || (self.expectedPIDVersion != 0 && version != self.expectedPIDVersion)) return NO;
    if (self.expectedPIDVersion == 0) self.expectedPIDVersion = version;
    return YES;
}
- (void)handleMessage:(mach_msg_header_t *)header capacity:(size_t)capacity {
    if (!CUReceivedLayoutIsSafe(header, capacity) || header->msgh_id != CUMessageID ||
        MACH_MSGH_BITS_VOUCHER(header->msgh_bits) != 0 || header->msgh_size > CUMaximumMessageSize()) return;
    size_t trailerOffset = CURoundMessage(header->msgh_size);
    if (trailerOffset > capacity || capacity - trailerOffset < sizeof(mach_msg_audit_trailer_t)) return;
    mach_msg_audit_trailer_t trailer;
    memcpy(&trailer, (uint8_t *)header + trailerOffset, sizeof(trailer));
    if (trailer.msgh_trailer_type != MACH_MSG_TRAILER_FORMAT_0 ||
        trailer.msgh_trailer_size < sizeof(trailer) || trailer.msgh_trailer_size > capacity - trailerOffset) return;
    size_t prefix = sizeof(*header);
    mach_msg_port_descriptor_t descriptor = {0};
    BOOL hasRight = (header->msgh_bits & MACH_MSGH_BITS_COMPLEX) != 0;
    if (hasRight) {
        mach_msg_body_t body;
        memcpy(&body, (uint8_t *)header + prefix, sizeof(body));
        if (body.msgh_descriptor_count != 1) return;
        prefix += sizeof(body);
        if (header->msgh_size - prefix < sizeof(descriptor)) return;
        memcpy(&descriptor, (uint8_t *)header + prefix, sizeof(descriptor));
        if (descriptor.type != MACH_MSG_PORT_DESCRIPTOR || descriptor.disposition != MACH_MSG_TYPE_PORT_SEND ||
            !MACH_PORT_VALID(descriptor.name)) return;
        prefix += sizeof(descriptor);
    }
    if (header->msgh_size < prefix || header->msgh_size - prefix < sizeof(CUWireHeader)) return;
    CUWireHeader wire;
    memcpy(&wire, (uint8_t *)header + prefix, sizeof(wire));
    if (wire.magic != CUWireMagic || wire.version != CUWireVersion ||
        wire.kind != (self.listener ? CUMessageRequest : CUMessageReply) ||
        wire.jsonLength > CUMachChannelMaximumJSONBytes || wire.jsonLength == 0 ||
        CURoundMessage(prefix + sizeof(wire) + wire.jsonLength) != header->msgh_size) return;
    if (self.listener) {
        if (MACH_MSGH_BITS_REMOTE(header->msgh_bits) != MACH_MSG_TYPE_PORT_SEND ||
            !MACH_PORT_VALID(header->msgh_remote_port) || wire.timeoutMilliseconds == 0 ||
            wire.timeoutMilliseconds > CUMaximumTimeout * 1000) return;
    } else if (MACH_MSGH_BITS_REMOTE(header->msgh_bits) != 0 ||
               header->msgh_remote_port != MACH_PORT_NULL || wire.timeoutMilliseconds != 0) return;
    if (![self validateAudit:trailer.msgh_audit nonce:wire.nonce]) return;
    NSUUID *uuid = [[NSUUID alloc] initWithUUIDBytes:wire.requestID];
    NSString *requestID = uuid.UUIDString;
    NSData *json = [NSData dataWithBytes:(uint8_t *)header + prefix + sizeof(wire) length:wire.jsonLength];
    NSDictionary *envelope = [NSJSONSerialization JSONObjectWithData:json options:0 error:NULL];
    if (![envelope isKindOfClass:NSDictionary.class] || !CUValidOperation(envelope[@"operation"]) ||
        ![envelope[@"metadata"] isKindOfClass:NSDictionary.class] || envelope.count > 3) return;
    for (id key in envelope) if (![@[@"operation", @"metadata", @"error"] containsObject:key]) return;
    NSString *operation = envelope[@"operation"];
    if (self.listener) {
        if (envelope[@"error"]) return;
        if (self.peerSendRight && header->msgh_remote_port != self.peerSendRight.port) return;
        NSError *error = nil;
        CUMachSendRight *replyRight = [CUMachSendRight retainedSendRightWithPort:header->msgh_remote_port error:&error];
        if (!replyRight) { [self shutdown:error report:YES]; return; }
        if (![self.allowedOperations containsObject:operation] || self.replies.count >= self.maxInFlight ||
            [self.seenIDs containsObject:requestID]) {
            CUMachChannelError code = ![self.allowedOperations containsObject:operation] ? CUMachChannelErrorUnauthorized
                : ([self.seenIDs containsObject:requestID] ? CUMachChannelErrorProtocol : CUMachChannelErrorCapacity);
            NSData *data = CUEncodeEnvelope(operation, nil, CUError(code, @"Operation is disallowed, duplicate or over capacity", KERN_SUCCESS), NULL);
            NSError *sendError = CUSend(replyRight, MACH_PORT_NULL, CUMessageReply, uuid, self.nonce, data, 0, nil);
            if (sendError) [self reportError:sendError];
            return;
        }
        if (!self.peerSendRight) {
            CUMachSendRight *watchRight = [CUMachSendRight retainedSendRightWithPort:header->msgh_remote_port error:&error];
            if (!watchRight || ![self installDeathSource:watchRight]) {
                [self shutdown:error ?: CUError(CUMachChannelErrorTransport, @"Could not observe peer port death", KERN_RESOURCE_SHORTAGE) report:YES];
                return;
            }
        }
        CUMachSendRight *attachment = hasRight ? [CUMachSendRight retainedSendRightWithPort:descriptor.name error:&error] : nil;
        if (hasRight && !attachment) { [self shutdown:error report:YES]; return; }
        [self.seenIDs addObject:requestID];
        [self.seenOrder addObject:requestID];
        if (self.seenOrder.count > 1024) {
            [self.seenIDs removeObject:self.seenOrder.firstObject];
            [self.seenOrder removeObjectAtIndex:0];
        }
        CUReplyContext *context = [CUReplyContext new];
        context.state = self;
        context.requestID = requestID;
        context.operation = operation;
        context.replyRight = replyRight;
        self.replies[requestID] = context;
        __weak CUReplyContext *weakContext = context;
        context.deadline = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, self.queue);
        if (!context.deadline) {
            [self shutdown:CUError(CUMachChannelErrorTransport, @"Could not allocate request deadline", KERN_RESOURCE_SHORTAGE) report:YES];
            return;
        }
        dispatch_source_set_timer(context.deadline, dispatch_time(DISPATCH_TIME_NOW, (int64_t)wire.timeoutMilliseconds * NSEC_PER_MSEC), DISPATCH_TIME_FOREVER, 0);
        dispatch_source_set_event_handler(context.deadline, ^{
            CUReplyContext *context = weakContext;
            if (context) [context.state finishContext:context];
        });
        dispatch_resume(context.deadline);
        CUMachRequest *request = [[CUMachRequest alloc] initPrivate];
        request.requestID = requestID;
        request.operation = operation;
        request.metadata = envelope[@"metadata"];
        request.sendRight = attachment;
        request.peerPID = audit_token_to_pid(trailer.msgh_audit);
        request.peerEUID = audit_token_to_euid(trailer.msgh_audit);
        request.peerPIDVersion = audit_token_to_pidversion(trailer.msgh_audit);
        context.request = request;
        CUMachRequestHandler handler = self.handler;
        CUMachReply reply = ^(NSDictionary *metadata, CUMachSendRight *right, NSError *replyError) {
            CUReplyContext *context = weakContext;
            CUChannelState *state = context.state;
            if (context && state) [state replyToContext:context metadata:metadata sendRight:right error:replyError];
        };
        dispatch_async(dispatch_get_main_queue(), ^{
            CUReplyContext *context = weakContext;
            CUMachRequest *request = context.request;
            if (context && request && atomic_load(&context->_active)) handler(request, reply);
        });
    } else {
        CUPendingRequest *pending = self.pending[requestID];
        if (!pending || pending.completed || ![pending.operation isEqualToString:operation]) return;
        NSError *remoteError = nil;
        if (envelope[@"error"]) {
            NSDictionary *value = envelope[@"error"];
            if (![value isKindOfClass:NSDictionary.class] || value.count != 3 ||
                ![value[@"domain"] isKindOfClass:NSString.class] ||
                ![value[@"code"] isKindOfClass:NSNumber.class] ||
                ![value[@"message"] isKindOfClass:NSString.class] || hasRight) return;
            remoteError = [NSError errorWithDomain:CUMachChannelErrorDomain code:CUMachChannelErrorRemote
                userInfo:@{NSLocalizedDescriptionKey: value[@"message"], @"remoteDomain": value[@"domain"], @"remoteCode": value[@"code"]}];
        }
        NSError *retainError = nil;
        CUMachSendRight *attachment = hasRight ? [CUMachSendRight retainedSendRightWithPort:descriptor.name error:&retainError] : nil;
        if (hasRight && !attachment) { [self shutdown:retainError report:YES]; return; }
        [self completePending:requestID metadata:remoteError ? nil : envelope[@"metadata"] sendRight:attachment error:remoteError];
    }
}
- (void)drainMessages {
    size_t capacity = CUMaximumMessageSize() + sizeof(mach_msg_max_trailer_t);
    NSMutableData *buffer = [NSMutableData dataWithLength:capacity];
    // Bound each drain so close/deadline work cannot be starved by an unsolicited sender.
    for (NSUInteger i = 0; i < 64 && !self.closed; i++) {
        memset(buffer.mutableBytes, 0, capacity);
        mach_msg_header_t *header = buffer.mutableBytes;
        kern_return_t result = mach_msg(header, MACH_RCV_MSG | MACH_RCV_TIMEOUT | MACH_RCV_INTERRUPT |
            MACH_RCV_TRAILER_TYPE(MACH_MSG_TRAILER_FORMAT_0) | MACH_RCV_TRAILER_ELEMENTS(MACH_RCV_TRAILER_AUDIT),
            0, (mach_msg_size_t)capacity, self.receivePort, 0, MACH_PORT_NULL);
        if (result == MACH_RCV_TIMED_OUT) return;
        if (result == MACH_MSG_SUCCESS) {
            [self handleMessage:header capacity:capacity];
            CUDestroyReceived(header, capacity);
            continue;
        }
        // Without MACH_RCV_LARGE the kernel destroys an oversized message, including rights.
        if (result == MACH_RCV_TOO_LARGE || result == MACH_RCV_INTERRUPTED) continue;
        if ((result & ~MACH_MSG_MASK) == MACH_RCV_BODY_ERROR) CUDestroyReceived(header, capacity);
        [self shutdown:CUError(CUMachChannelErrorTransport, @"Mach receive failed", result) report:YES];
        return;
    }
}
- (void)replyToContext:(CUReplyContext *)context metadata:(NSDictionary *)metadata
            sendRight:(CUMachSendRight *)right error:(NSError *)error {
    NSError *encodeError = nil;
    NSData *data = CUEncodeEnvelope(context.operation, metadata, error, &encodeError);
    if (!data) data = CUEncodeEnvelope(context.operation, nil, encodeError, NULL);
    dispatch_async(self.queue, ^{
        if (!atomic_load(&context->_active) || self.closed) return;
        NSError *sendError = CUSend(context.replyRight, MACH_PORT_NULL, CUMessageReply,
            [[NSUUID alloc] initWithUUIDString:context.requestID], self.nonce, data, 0, error || encodeError ? nil : right);
        [self finishContext:context];
        if (sendError) [self reportError:sendError];
    });
}
- (void)sendOperation:(NSString *)operation data:(NSData *)data sendRight:(CUMachSendRight *)right
              timeout:(NSTimeInterval)timeout completion:(CUMachCompletion)completion {
    dispatch_async(self.queue, ^{
        if (!self.started || self.closed) {
            CUComplete(completion, nil, nil, CUError(CUMachChannelErrorClosed, @"Mach channel is not open", KERN_SUCCESS));
            return;
        }
        if (![self.allowedOperations containsObject:operation] || self.pending.count >= self.maxInFlight) {
            CUComplete(completion, nil, nil, CUError([self.allowedOperations containsObject:operation] ?
                CUMachChannelErrorCapacity : CUMachChannelErrorUnauthorized, @"Operation is disallowed or channel is at capacity", KERN_SUCCESS));
            return;
        }
        NSUUID *uuid = NSUUID.UUID;
        NSString *requestID = uuid.UUIDString;
        CUPendingRequest *pending = [CUPendingRequest new];
        pending.operation = operation;
        pending.completion = completion;
        self.pending[requestID] = pending;
        __weak CUChannelState *weakSelf = self;
        pending.deadline = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, self.queue);
        if (!pending.deadline) {
            [self completePending:requestID metadata:nil sendRight:nil error:
                CUError(CUMachChannelErrorTransport, @"Could not allocate request deadline", KERN_RESOURCE_SHORTAGE)];
            return;
        }
        dispatch_source_set_timer(pending.deadline, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)), DISPATCH_TIME_FOREVER, 0);
        dispatch_source_set_event_handler(pending.deadline, ^{
            CUChannelState *state = weakSelf;
            CUPendingRequest *expired = state.pending[requestID];
            if (!expired || expired.completed) return;
            [state completePending:requestID metadata:nil sendRight:nil error:
                CUError(CUMachChannelErrorTimeout, @"Mach request timed out; its operation may already have run", KERN_SUCCESS)];
        });
        dispatch_resume(pending.deadline);
        NSError *sendError = CUSend(self.peerSendRight, self.receivePort, CUMessageRequest, uuid,
            self.nonce, data, (uint32_t)ceil(timeout * 1000), right);
        if (sendError) {
            [self completePending:requestID metadata:nil sendRight:nil error:sendError];
            if ([sendError.userInfo[@"machResult"] intValue] == MACH_SEND_INVALID_DEST) [self shutdown:sendError report:YES];
        }
    });
}
@end

static CUChannelState *CUCreateState(pid_t pid, uid_t euid, int pidVersion, NSData *nonce,
                                     NSSet<NSString *> *operations, NSUInteger limit, CUMachErrorHandler errorHandler,
                                     NSError **error) {
    if (!CUValidConfiguration(pid, pidVersion, nonce, operations, limit, error)) return nil;
    CUChannelState *state = [CUChannelState new];
    state.expectedPID = pid;
    state.expectedEUID = euid;
    state.expectedPIDVersion = pidVersion;
    state.nonce = nonce;
    NSMutableSet<NSString *> *frozenOperations = [NSMutableSet setWithCapacity:operations.count];
    for (NSString *operation in operations) [frozenOperations addObject:[operation copy]];
    state.allowedOperations = frozenOperations;
    state.maxInFlight = limit;
    state.errorHandler = errorHandler;
    return state;
}

@implementation CUMachListener {
    CUChannelState *_state;
}
- (instancetype)initWithExpectedPeerPID:(pid_t)pid euid:(uid_t)euid pidVersion:(int)pidVersion
                                  nonce:(NSData *)nonce allowedOperations:(NSSet<NSString *> *)operations
                            maxInFlight:(NSUInteger)limit handler:(CUMachRequestHandler)handler
                           errorHandler:(CUMachErrorHandler)errorHandler error:(NSError **)error {
    if (!handler) {
        if (error) *error = CUError(CUMachChannelErrorInvalidConfiguration, @"A request handler is required", KERN_SUCCESS);
        return nil;
    }
    self = [super init];
    if (self) {
        _state = CUCreateState(pid, euid, pidVersion, nonce, operations, limit, errorHandler, error);
        if (!_state) return nil;
        _state.listener = YES;
        _state.handler = handler;
        _state.serviceName = [NSString stringWithFormat:@"%@%@", CUServicePrefix, NSUUID.UUID.UUIDString.lowercaseString];
    }
    return self;
}
- (NSString *)serviceName { return _state.serviceName; }
- (void)startWithCompletion:(CUMachStartCompletion)completion { [_state start:completion]; }
- (void)close { [_state close]; }
- (void)dealloc { [_state close]; }
@end

@implementation CUMachClient {
    CUChannelState *_state;
}
- (instancetype)initWithServiceName:(NSString *)serviceName expectedPeerPID:(pid_t)pid euid:(uid_t)euid
                          pidVersion:(int)pidVersion nonce:(NSData *)nonce
                   allowedOperations:(NSSet<NSString *> *)operations maxInFlight:(NSUInteger)limit
                        errorHandler:(CUMachErrorHandler)errorHandler error:(NSError **)error {
    if (![serviceName isKindOfClass:NSString.class] || ![serviceName hasPrefix:(NSString *)CUServicePrefix] ||
        [serviceName lengthOfBytesUsingEncoding:NSUTF8StringEncoding] >= BOOTSTRAP_MAX_NAME_LEN) {
        if (error) *error = CUError(CUMachChannelErrorInvalidConfiguration, @"A per-instance OpenCU bootstrap name is required", KERN_SUCCESS);
        return nil;
    }
    self = [super init];
    if (self) {
        _state = CUCreateState(pid, euid, pidVersion, nonce, operations, limit, errorHandler, error);
        if (!_state) return nil;
        _state.serviceName = serviceName;
    }
    return self;
}
- (void)startWithCompletion:(CUMachStartCompletion)completion { [_state start:completion]; }
- (void)sendRequestOperation:(NSString *)operation metadata:(NSDictionary *)metadata
                  sendRight:(CUMachSendRight *)right timeout:(NSTimeInterval)timeout completion:(CUMachCompletion)completion {
    NSError *error = nil;
    NSData *data = CUEncodeEnvelope(operation, metadata, nil, &error);
    if (!isfinite(timeout) || timeout <= 0 || timeout > CUMaximumTimeout) {
        error = CUError(CUMachChannelErrorInvalidConfiguration, @"Request timeout must be in (0, 300] seconds", KERN_SUCCESS);
    }
    if (error || !data) { CUComplete(completion, nil, nil, error); return; }
    [_state sendOperation:[operation copy] data:data sendRight:right timeout:timeout completion:completion];
}
- (void)close { [_state close]; }
- (void)dealloc { [_state close]; }
@end
