#import "producer-channel.h"
#import <CoreFoundation/CoreFoundation.h>
#import <bsm/libbsm.h>
#include <sys/event.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <cmath>
#include <exception>
#include <limits.h>

NSErrorDomain const OPProducerChannelErrorDomain = @"ai.trisoul.native-presentation.producer-channel";

static NSError *OPChannelError(NSInteger code, NSString *message) {
  return [NSError errorWithDomain:OPProducerChannelErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey: message}];
}
static BOOL OPFail(NSError **error, NSInteger code, NSString *message) {
  if (error) *error = OPChannelError(code, message);
  return NO;
}
static BOOL OPString(id value) { return [value isKindOfClass:NSString.class] && [value length] > 0; }
static BOOL OPUUID(id value) {
  if (!OPString(value) || [value length] != 36) return NO;
  NSUUID *uuid = [[NSUUID alloc] initWithUUIDString:value];
  return uuid && [uuid.UUIDString caseInsensitiveCompare:value] == NSOrderedSame;
}
static BOOL OPUnsigned(id value, uint64_t minimum, uint64_t maximum) {
  if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return NO;
  double number = [value doubleValue];
  return std::isfinite(number) && number >= minimum && number <= maximum && std::floor(number) == number;
}
static BOOL OPTrue(id value) {
  return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID() && [value boolValue];
}
static BOOL OPPositive(id value) {
  return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value) != CFBooleanGetTypeID() && std::isfinite([value doubleValue]) && [value doubleValue] > 0;
}
static NSArray<NSString *> *OPIdentityKeys() {
  return @[@"presentationID", @"threadID", @"turnID", @"sourceGeneration", @"targetId", @"viewId", @"captureId", @"pid", @"windowId", @"processIdentity"];
}
static NSArray<NSString *> *OPSourceKeys() {
  return @[@"targetId", @"viewId", @"captureId", @"pid", @"windowId", @"processIdentity"];
}
static BOOL OPIdentityValue(NSString *key, id value) {
  if ([key isEqual:@"presentationID"]) return OPUUID(value);
  if ([key isEqual:@"sourceGeneration"] || [key isEqual:@"windowId"]) return OPUnsigned(value, 1, UINT32_MAX);
  if ([key isEqual:@"pid"]) return OPUnsigned(value, 1, INT_MAX);
  return OPString(value);
}
static void OPOnMain(dispatch_block_t block) {
  if (NSThread.isMainThread) block(); else dispatch_async(dispatch_get_main_queue(), block);
}
static BOOL OPKernelProducerMatches(NSDictionary *expected, NSError **error) {
  mach_port_t task = MACH_PORT_NULL;
  kern_return_t result = task_name_for_pid(mach_task_self(), [expected[@"pid"] intValue], &task);
  if (result != KERN_SUCCESS || !MACH_PORT_VALID(task)) return OPFail(error, 8, @"The producer kernel task identity cannot be read; exit is not proven.");
  audit_token_t token = INVALID_AUDIT_TOKEN_VALUE;
  mach_msg_type_number_t count = TASK_AUDIT_TOKEN_COUNT;
  result = task_info(task, TASK_AUDIT_TOKEN, reinterpret_cast<task_info_t>(&token), &count);
  (void)mach_port_deallocate(mach_task_self(), task);
  if (result != KERN_SUCCESS || count != TASK_AUDIT_TOKEN_COUNT) return OPFail(error, 8, @"The producer kernel audit token cannot be read; exit is not proven.");
  if (audit_token_to_pid(token) != [expected[@"pid"] intValue] || audit_token_to_euid(token) != [expected[@"euid"] unsignedIntValue] || audit_token_to_pidversion(token) != [expected[@"pidVersion"] intValue]) return OPFail(error, 8, @"The kernel process is not the reserved producer instance; exit is not proven.");
  return YES;
}

@interface OPProducerChannel () {
  CUMachListener *_listener;
  NSDictionary *_expectedProducer;
  NSDictionary *_endpoint;
  OPProducerOperationHandler _operationHandler;
  OPProducerChannelErrorHandler _errorHandler;
  NSMutableArray<OPProducerChannelStartCompletion> *_startCompletions;
  NSMutableDictionary<NSString *, CUMachReply> *_detachReplies;
  NSDictionary *_pendingOperation;
  NSError *_channelFailure;
  NSError *_producerExitMonitorFailure;
  NSError *_producerRetirementFailure;
  int _producerExitFD;
  BOOL _producerExitConfirmed;
  BOOL _producerRetirementRequested;
  BOOL _producerRetirementRemoveSubmitted;
  uint64_t _lastCompletedOperationID;
  uint32_t _candidateContextID;
  BOOL _startRequested;
  BOOL _ready;
  BOOL _receivedPublish;
  BOOL _publishInFlight;
  BOOL _published;
  BOOL _uncertainOperation;
  BOOL _ending;
  BOOL _endAccepted;
  BOOL _surfaceDetached;
  BOOL _hostReleased;
  BOOL _closed;
}
@property(nonatomic, readwrite, copy) NSDictionary<NSString *, id> *identity;
@property(nonatomic, readwrite, copy) NSDictionary<NSString *, id> *sourceIdentity;
@property(nonatomic, readwrite, copy, nullable) NSString *bridgeSessionId;
@property(nonatomic, readwrite) uint32_t currentContextID;
- (void)handleRequest:(CUMachRequest *)request reply:(CUMachReply)reply;
- (void)reportError:(NSError *)error;
- (BOOL)armProducerExitMonitor:(NSError **)error;
- (void)readProducerExit;
@end

@implementation OPProducerChannel
- (instancetype)initWithIdentity:(NSDictionary *)identity expectedProducer:(NSDictionary *)expectedProducer operationHandler:(OPProducerOperationHandler)operationHandler errorHandler:(OPProducerChannelErrorHandler)errorHandler error:(NSError **)error {
  _producerExitFD = -1;
  if (!NSThread.isMainThread) { OPFail(error, 1, @"The producer channel must be constructed on its owner main thread."); return nil; }
  if (![identity isKindOfClass:NSDictionary.class] || ![expectedProducer isKindOfClass:NSDictionary.class] || !operationHandler) { OPFail(error, 1, @"A producer channel requires immutable source and audited producer identities plus native operation delivery."); return nil; }
  NSMutableDictionary *owned = NSMutableDictionary.dictionary;
  for (NSString *key in OPIdentityKeys()) {
    if (!OPIdentityValue(key, identity[key])) { OPFail(error, 1, [NSString stringWithFormat:@"The producer channel requires its actual %@ identity.", key]); return nil; }
    owned[key] = [identity[key] copy];
  }
  if (!OPUnsigned(expectedProducer[@"pid"], 1, INT_MAX) || !OPUnsigned(expectedProducer[@"euid"], 0, UINT_MAX) || !OPUnsigned(expectedProducer[@"pidVersion"], 1, INT_MAX)) { OPFail(error, 1, @"A real producer PID, EUID and positive PID version are required."); return nil; }
  NSError *failure = nil;
  NSDictionary *host = CUMachCurrentProcessIdentity(&failure);
  if (!host || !OPUnsigned(host[@"pid"], 1, INT_MAX) || !OPUnsigned(host[@"euid"], 0, UINT_MAX) || !OPUnsigned(host[@"pidVersion"], 1, INT_MAX)) { if (error) *error = failure ?: OPChannelError(1, @"The host kernel audit identity is unavailable."); return nil; }
  NSData *nonce = CUMachCreateNonce();
  if (nonce.length != 32) { OPFail(error, 1, @"A real random Mach channel nonce is unavailable."); return nil; }
  if (!(self = [super init])) return nil;
  _identity = [owned copy];
  NSMutableDictionary *source = NSMutableDictionary.dictionary;
  for (NSString *key in OPSourceKeys()) source[key] = owned[key];
  _sourceIdentity = [source copy];
  _expectedProducer = @{@"pid": [expectedProducer[@"pid"] copy], @"euid": [expectedProducer[@"euid"] copy], @"pidVersion": [expectedProducer[@"pidVersion"] copy]};
  NSError *monitorFailure = nil;
  [self armProducerExitMonitor:&monitorFailure];
  _producerExitMonitorFailure = monitorFailure;
  _operationHandler = [operationHandler copy];
  _errorHandler = [errorHandler copy];
  _startCompletions = NSMutableArray.array;
  _detachReplies = NSMutableDictionary.dictionary;
  __weak OPProducerChannel *weak = self;
  _listener = [[CUMachListener alloc] initWithExpectedPeerPID:[_expectedProducer[@"pid"] intValue] euid:[_expectedProducer[@"euid"] unsignedIntValue] pidVersion:[_expectedProducer[@"pidVersion"] intValue] nonce:nonce allowedOperations:[NSSet setWithArray:@[@"publishPresentation", @"prepareOperation", @"completeOperation", @"willEndStream", @"sourceDidEndStream"]] maxInFlight:4 handler:^(CUMachRequest *request, CUMachReply reply) {
    OPProducerChannel *owner = weak;
    if (owner) [owner handleRequest:request reply:reply];
    else reply(nil, nil, OPChannelError(4, @"The native producer channel owner was released."));
  } errorHandler:^(NSError *channelError) {
    OPProducerChannel *owner = weak;
    if (!owner || owner->_closed) return;
    owner->_channelFailure = channelError;
    [owner reportError:channelError];
  } error:&failure];
  if (!_listener) { if (error) *error = failure; return nil; }
  _endpoint = @{@"name": _listener.serviceName, @"nonce": [nonce base64EncodedStringWithOptions:0], @"pid": host[@"pid"], @"euid": host[@"euid"], @"pidVersion": host[@"pidVersion"]};
  return self;
}

- (void)reportError:(NSError *)error {
  if (!_errorHandler) return;
  @try { _errorHandler(error); } @catch (__unused NSException *exception) {}
}
- (BOOL)armProducerExitMonitor:(NSError **)error {
  if (_producerExitFD >= 0 || _producerExitConfirmed) return YES;
  if (!OPKernelProducerMatches(_expectedProducer, error)) return NO;
  int descriptor = kqueue();
  if (descriptor < 0) return OPFail(error, 8, @"The kernel producer exit monitor could not be created.");
  if (fcntl(descriptor, F_SETFD, FD_CLOEXEC) < 0) { close(descriptor); return OPFail(error, 8, @"The kernel producer exit monitor could not be isolated."); }
  struct kevent change = {}, receipt = {};
  EV_SET(&change, (uintptr_t)[_expectedProducer[@"pid"] intValue], EVFILT_PROC, EV_ADD | EV_ONESHOT | EV_RECEIPT, NOTE_EXIT, 0, nullptr);
  const struct timespec immediate = {0, 0};
  int received = kevent(descriptor, &change, 1, &receipt, 1, &immediate);
  if (received != 1 || !(receipt.flags & EV_ERROR) || receipt.data != 0) { close(descriptor); return OPFail(error, 8, @"The kernel did not register the producer exit monitor."); }
  // Check again after synchronous registration so a reused PID cannot bind the
  // exit filter to a different producer. Permission/absence is never exit proof.
  if (!OPKernelProducerMatches(_expectedProducer, error)) { close(descriptor); return NO; }
  _producerExitFD = descriptor;
  _producerExitMonitorFailure = nil;
  return YES;
}
- (void)readProducerExit {
  if (_producerExitFD < 0 || _producerExitConfirmed) return;
  struct kevent event = {};
  const struct timespec immediate = {0, 0};
  int received = kevent(_producerExitFD, nullptr, 0, &event, 1, &immediate);
  if (received < 0) {
    if (errno != EINTR) _producerExitMonitorFailure = OPChannelError(8, @"The producer exit monitor could not be read; exit is not proven.");
    return;
  }
  if (received == 1 && !(event.flags & EV_ERROR) && event.filter == EVFILT_PROC && event.ident == (uintptr_t)[_expectedProducer[@"pid"] intValue] && (event.fflags & NOTE_EXIT)) {
    _producerExitConfirmed = YES;
    close(_producerExitFD);
    _producerExitFD = -1;
  }
}
- (void)finishStart:(NSError *)error {
  NSArray *completions = [_startCompletions copy];
  [_startCompletions removeAllObjects];
  for (OPProducerChannelStartCompletion completion in completions) completion(error ? nil : _endpoint, error);
}
- (void)startWithCompletion:(OPProducerChannelStartCompletion)completion {
  OPOnMain(^{
    if (self->_closed || self->_channelFailure) { completion(nil, self->_channelFailure ?: OPChannelError(4, @"The producer channel is closed.")); return; }
    if (self->_ready) { completion(self->_endpoint, nil); return; }
    [self->_startCompletions addObject:[completion copy]];
    if (self->_startRequested) return;
    self->_startRequested = YES;
    __weak OPProducerChannel *weak = self;
    [self->_listener startWithCompletion:^(NSError *failure) {
      OPProducerChannel *owner = weak;
      if (!owner) return;
      if (owner->_closed) { [owner finishStart:OPChannelError(4, @"The producer channel closed before startup completed.")]; return; }
      if (failure) { owner->_channelFailure = failure; [owner reportError:failure]; [owner finishStart:failure]; return; }
      owner->_ready = YES;
      [owner finishStart:nil];
    }];
  });
}
- (BOOL)isClosed { return _closed; }
- (BOOL)isLive { return !_closed && _ready && _published && !_ending && !_surfaceDetached && !_hostReleased && !_uncertainOperation && !_channelFailure; }
- (BOOL)matchesIdentity:(NSDictionary *)payload {
  if (![payload isKindOfClass:NSDictionary.class] || !_bridgeSessionId || ![payload[@"bridgeSessionId"] isEqual:_bridgeSessionId]) return NO;
  for (NSString *key in OPIdentityKeys()) if (!OPIdentityValue(key, payload[key]) || ![payload[key] isEqual:_identity[key]]) return NO;
  return YES;
}
- (BOOL)validateFrameIdentity:(NSDictionary *)frame {
  return NSThread.isMainThread && self.isLive && [self matchesIdentity:frame] && OPUnsigned(frame[@"contextID"], 1, UINT32_MAX) && [frame[@"contextID"] unsignedIntValue] == _currentContextID;
}
- (NSDictionary *)replyIdentity:(NSDictionary *)request {
  NSMutableDictionary *value = [_identity mutableCopy];
  value[@"bridgeSessionId"] = _bridgeSessionId ?: (OPUUID(request[@"bridgeSessionId"]) ? request[@"bridgeSessionId"] : NSNull.null);
  return value;
}
- (NSDictionary *)nativeIdentity {
  return @{@"presentationID": _identity[@"presentationID"], @"threadID": _identity[@"threadID"], @"turnID": _identity[@"turnID"], @"sourceGeneration": _identity[@"sourceGeneration"], @"source": _sourceIdentity};
}
- (BOOL)bindRequest:(CUMachRequest *)request error:(NSError **)error {
  NSDictionary *payload = request.metadata;
  if (request.peerPID != [_expectedProducer[@"pid"] intValue] || request.peerEUID != [_expectedProducer[@"euid"] unsignedIntValue] || request.peerPIDVersion != [_expectedProducer[@"pidVersion"] intValue]) return OPFail(error, 2, @"The producer audit identity does not match this reservation.");
  if (![payload isKindOfClass:NSDictionary.class] || !OPUUID(payload[@"bridgeSessionId"])) return OPFail(error, 2, @"A real bridge session UUID is required.");
  for (NSString *key in OPIdentityKeys()) if (!OPIdentityValue(key, payload[key]) || ![payload[key] isEqual:_identity[key]]) return OPFail(error, 2, @"The producer request does not match its immutable source reservation.");
  if (_bridgeSessionId && ![payload[@"bridgeSessionId"] isEqual:_bridgeSessionId]) return OPFail(error, 2, @"The producer bridge session cannot be rebound.");
  if (_producerExitFD < 0 && !_producerExitConfirmed) {
    NSError *monitorFailure = nil;
    [self armProducerExitMonitor:&monitorFailure];
    _producerExitMonitorFailure = monitorFailure;
  }
  if (!_bridgeSessionId) _bridgeSessionId = [payload[@"bridgeSessionId"] copy];
  return YES;
}
- (NSDictionary *)performNative:(NSString *)operation payload:(NSDictionary *)payload right:(CUMachSendRight *)right error:(NSError **)error {
  CUMachSendRight *borrowed __attribute__((objc_precise_lifetime)) = right;
  @try {
    try {
      OPProducerOperationHandler handler = _operationHandler;
      NSDictionary *result = handler ? handler(operation, payload, borrowed) : nil;
      if (![result isKindOfClass:NSDictionary.class] || !OPTrue(result[@"accepted"])) {
        OPFail(error, 5, OPString(result[@"message"]) ? result[@"message"] : (OPString(result[@"reason"]) ? result[@"reason"] : @"The native host did not accept this producer operation."));
        return nil;
      }
      if ([operation isEqual:@"publishRemotePresentation"]) {
        for (NSString *key in @[@"presentationID", @"sourceGeneration"]) {
          if (![result[key] isEqual:payload[key]]) { OPFail(error, 5, @"The actual publication result belongs to a different native source."); return nil; }
        }
      } else if ([operation isEqual:@"prepareOperation"] || [operation isEqual:@"completeOperation"]) {
        NSDictionary *actualIdentity = result[@"identity"];
        if (![actualIdentity isKindOfClass:NSDictionary.class]) { OPFail(error, 5, @"The actual atomic operation result has no native source identity."); return nil; }
        for (NSString *key in @[@"presentationID", @"threadID", @"turnID", @"source"]) {
          if (![actualIdentity[key] isEqual:payload[key]]) { OPFail(error, 5, @"The actual atomic operation result belongs to a different native source."); return nil; }
        }
        for (NSString *key in @[@"presentationID", @"sourceGeneration", @"contextID", @"operationID"]) {
          if (![result[key] isEqual:payload[key]]) { OPFail(error, 5, @"The actual atomic operation result does not match its context and sequence."); return nil; }
        }
      }
      return result;
    } catch (const std::exception &exception) {
      OPFail(error, 5, [NSString stringWithUTF8String:exception.what()] ?: @"Native producer operation failed.");
      return nil;
    } catch (...) {
      OPFail(error, 5, @"Native producer operation failed.");
      return nil;
    }
  } @catch (NSException *exception) {
    OPFail(error, 5, exception.reason ?: @"Native producer operation failed.");
    return nil;
  }
}
- (void)flushDetachReplies:(NSError *)error {
  NSArray<CUMachReply> *replies = [_detachReplies.allValues copy];
  [_detachReplies removeAllObjects];
  NSMutableDictionary *metadata = [[self replyIdentity:@{}] mutableCopy];
  metadata[@"detached"] = @(_surfaceDetached);
  for (CUMachReply reply in replies) reply(metadata, nil, error);
}
- (void)holdDetachReply:(CUMachReply)reply request:(CUMachRequest *)request {
  if (_detachReplies.count >= 4) {
    NSError *error = OPChannelError(6, @"The native detach reply capacity is exhausted.");
    reply([self replyIdentity:request.metadata], nil, error);
    [self reportError:error];
    return;
  }
  NSString *identifier = [request.requestID copy];
  _detachReplies[identifier] = [reply copy];
  // Mach owns the actual request deadline. This only bounds stale weak replies
  // retained by the adapter when the transport has already expired its context.
  __weak OPProducerChannel *weak = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    OPProducerChannel *owner = weak;
    if (!owner) return;
    CUMachReply expired = owner->_detachReplies[identifier];
    if (!expired) return;
    [owner->_detachReplies removeObjectForKey:identifier];
    NSError *error = OPChannelError(7, @"The host has not confirmed native surface detachment.");
    expired([owner replyIdentity:@{}], nil, error);
    [owner reportError:error];
  });
}
- (void)handleRequest:(CUMachRequest *)request reply:(CUMachReply)reply {
  NSDictionary *wire = request.metadata;
  NSString *operation = request.operation;
  BOOL duplicatePublish = _receivedPublish;
  if ([operation isEqual:@"publishPresentation"]) _receivedPublish = YES;
  NSError *failure = nil;
  if (_closed || !_ready || _channelFailure) failure = _channelFailure ?: OPChannelError(4, @"The producer channel cannot accept new requests.");
  else if (![self bindRequest:request error:&failure]) {}
  if (!failure) {
    NSMutableSet *keys = [NSMutableSet setWithArray:OPIdentityKeys()];
    [keys addObject:@"bridgeSessionId"];
    if ([operation isEqual:@"publishPresentation"]) [keys addObjectsFromArray:@[@"contextID", @"width", @"height"]];
    else if ([operation isEqual:@"prepareOperation"] || [operation isEqual:@"completeOperation"]) [keys addObjectsFromArray:@[@"operationID", @"kind", @"expectedContextID", @"contextID", @"width", @"height"]];
    for (id key in wire) if (![keys containsObject:key]) { failure = OPChannelError(3, @"The producer request contains fields outside the flat native protocol."); break; }
  }
  if (failure) { reply([self replyIdentity:wire], nil, failure); [self reportError:failure]; return; }
  NSMutableDictionary *response = [[self replyIdentity:wire] mutableCopy];
  NSMutableDictionary *native = [[self nativeIdentity] mutableCopy];
  if ([operation isEqual:@"publishPresentation"]) {
    if (duplicatePublish || _ending || _surfaceDetached || _hostReleased) failure = OPChannelError(4, @"This producer reservation cannot publish again.");
    else if (request.sendRight || !OPUnsigned(wire[@"contextID"], 1, UINT32_MAX) || !OPPositive(wire[@"width"]) || !OPPositive(wire[@"height"])) failure = OPChannelError(3, @"The publication requires its real context ID and positive finite point size without a fence attachment.");
    if (!failure) {
      _publishInFlight = YES;
      _candidateContextID = [wire[@"contextID"] unsignedIntValue];
      native[@"contextID"] = wire[@"contextID"];
      native[@"sourceSize"] = @{@"width": wire[@"width"], @"height": wire[@"height"]};
      // PIPStackItem.init zero-initializes contributes; visibility derives it later.
      native[@"contributesToStackLayout"] = @NO;
      NSDictionary *actual = [self performNative:@"publishRemotePresentation" payload:native right:nil error:&failure];
      _publishInFlight = NO;
      if (actual && !failure) {
        _published = YES;
        _currentContextID = _candidateContextID;
        _candidateContextID = 0;
        response[@"published"] = @YES;
        for (NSString *key in @[@"contextID", @"width", @"height"]) response[key] = wire[key];
      } else _uncertainOperation = YES;
    }
    if (failure) response[@"published"] = @NO;
  } else if ([operation isEqual:@"prepareOperation"] || [operation isEqual:@"completeOperation"]) {
    BOOL prepare = [operation isEqual:@"prepareOperation"];
    NSString *kind = wire[@"kind"];
    BOOL validKind = OPString(kind) && [@[@"resize", @"resize-in-progress", @"replace-context"] containsObject:kind];
    if (!_published || _ending || _surfaceDetached || _hostReleased || _uncertainOperation) failure = OPChannelError(4, @"The native source is not live for an atomic operation.");
    else if (!validKind || !OPUnsigned(wire[@"operationID"], 1, 9007199254740991ULL) || !OPUnsigned(wire[@"expectedContextID"], 1, UINT32_MAX) || !OPUnsigned(wire[@"contextID"], 1, UINT32_MAX) || !OPPositive(wire[@"width"]) || !OPPositive(wire[@"height"])) failure = OPChannelError(3, @"The native operation identity, kind, context and point geometry are invalid.");
    else if (prepare && (!request.sendRight || !MACH_PORT_VALID(request.sendRight.port))) failure = OPChannelError(3, @"A real retained Mach fence send right is required for prepare.");
    else if (!prepare && request.sendRight) failure = OPChannelError(3, @"Completion does not accept a Mach attachment.");
    if (!failure && prepare) {
      uint32_t context = [wire[@"contextID"] unsignedIntValue];
      BOOL replacing = [kind isEqual:@"replace-context"];
      if (_pendingOperation || [wire[@"operationID"] unsignedLongLongValue] != _lastCompletedOperationID + 1 || [wire[@"expectedContextID"] unsignedIntValue] != _currentContextID || (replacing ? context == _currentContextID : context != _currentContextID)) failure = OPChannelError(3, @"The prepare request does not match the current context and next operation sequence.");
    }
    if (!failure && !prepare) {
      if (!_pendingOperation) failure = OPChannelError(3, @"There is no prepared native operation to complete.");
      else for (NSString *key in @[@"operationID", @"kind", @"expectedContextID", @"contextID", @"width", @"height"]) if (![wire[key] isEqual:_pendingOperation[key]]) { failure = OPChannelError(3, @"Completion does not match the exact prepared operation."); break; }
    }
    if (!failure) {
      for (NSString *key in @[@"operationID", @"kind", @"expectedContextID", @"contextID", @"width", @"height"]) native[key] = wire[key];
      _candidateContextID = [wire[@"contextID"] unsignedIntValue];
      NSDictionary *actual = [self performNative:operation payload:native right:request.sendRight error:&failure];
      if (actual && !failure) {
        if (prepare) {
          _pendingOperation = [wire copy];
          if (![kind isEqual:@"resize-in-progress"]) _currentContextID = _candidateContextID;
        } else {
          _lastCompletedOperationID = [wire[@"operationID"] unsignedLongLongValue];
          _pendingOperation = nil;
        }
        _candidateContextID = 0;
        response[prepare ? @"prepared" : @"completed"] = @YES;
        for (NSString *key in @[@"operationID", @"kind", @"contextID", @"width", @"height"]) response[key] = wire[key];
      } else _uncertainOperation = YES;
    }
    if (failure) response[prepare ? @"prepared" : @"completed"] = @NO;
  } else if ([operation isEqual:@"willEndStream"]) {
    if (request.sendRight) failure = OPChannelError(3, @"Stream end does not accept a Mach attachment.");
    if (!failure) {
      _ending = YES;
      if (_surfaceDetached || (!_receivedPublish && !_publishInFlight)) { _surfaceDetached = YES; _endAccepted = YES; }
      else if (!_endAccepted) {
        uint32_t context = _currentContextID ?: _candidateContextID;
        if (!context) failure = OPChannelError(5, @"A failed or unknown publication still requires actual host release proof.");
        else {
          native[@"contextID"] = @(context);
          if ([self performNative:@"removePresentation" payload:native right:nil error:&failure]) _endAccepted = YES;
        }
      }
      response[@"accepted"] = @(_endAccepted);
    }
  } else if ([operation isEqual:@"sourceDidEndStream"]) {
    if (request.sendRight) failure = OPChannelError(3, @"Detach acknowledgement does not accept a Mach attachment.");
    else if (!_endAccepted) failure = OPChannelError(3, @"Stream removal has not been accepted by the native host.");
    else if (!_surfaceDetached) { [self holdDetachReply:reply request:request]; return; }
    else { response[@"detached"] = @YES; reply(response, nil, nil); [self closeCarrier]; return; }
  } else failure = OPChannelError(3, @"Unsupported native producer operation.");
  reply(response, nil, failure);
  if (failure) [self reportError:failure];
}

- (BOOL)confirmSurfaceDetached:(NSDictionary *)eventPayload {
  if (!NSThread.isMainThread || ![eventPayload isKindOfClass:NSDictionary.class] || !OPTrue(eventPayload[@"surfaceDetached"])) return NO;
  NSDictionary *event = [eventPayload[@"identity"] isKindOfClass:NSDictionary.class] ? eventPayload[@"identity"] : eventPayload;
  for (NSString *key in @[@"presentationID", @"threadID", @"turnID"]) if (![event[key] isEqual:_identity[key]]) return NO;
  if (![event[@"source"] isKindOfClass:NSDictionary.class] || ![event[@"source"] isEqual:_sourceIdentity] || !OPUnsigned(eventPayload[@"sourceGeneration"], 1, UINT32_MAX) || ![eventPayload[@"sourceGeneration"] isEqual:_identity[@"sourceGeneration"]] || !OPUnsigned(eventPayload[@"contextID"], 1, UINT32_MAX)) return NO;
  uint32_t context = [eventPayload[@"contextID"] unsignedIntValue];
  if (context != _currentContextID && context != _candidateContextID) return NO;
  if (eventPayload[@"bridgeSessionId"] && ![eventPayload[@"bridgeSessionId"] isEqual:_bridgeSessionId]) return NO;
  _surfaceDetached = YES;
  _ending = YES;
  BOOL hasFinalReplies = _detachReplies.count > 0;
  [self flushDetachReplies:nil];
  if (hasFinalReplies || _producerRetirementRequested) [self closeCarrier];
  return YES;
}
- (void)confirmHostReleased {
  OPOnMain(^{
    self->_hostReleased = YES;
    self->_surfaceDetached = YES;
    self->_ending = YES;
    self->_endAccepted = YES;
    [self flushDetachReplies:nil];
  });
}
- (NSDictionary *)retireExitedProducer:(NSError **)error {
  if (!NSThread.isMainThread) { OPFail(error, 1, @"Producer retirement requires its owner main thread."); return nil; }
  if (_surfaceDetached || _closed) return [self snapshot];
  if (!_producerExitConfirmed) {
    if (_producerExitFD < 0) {
      NSError *monitorFailure = nil;
      if (![self armProducerExitMonitor:&monitorFailure]) { _producerExitMonitorFailure = monitorFailure; if (error) *error = monitorFailure; return nil; }
    }
    [self readProducerExit];
    if (!_producerExitConfirmed) { OPFail(error, 8, @"No identity-pinned kernel producer exit has been observed."); return nil; }
  }
  if (_producerRetirementRequested) return [self snapshot];
  _producerRetirementRequested = YES;
  _ending = YES;
  if (!_receivedPublish && !_publishInFlight && !_published) {
    _surfaceDetached = YES;
    _endAccepted = YES;
    [self closeCarrier];
    return [self snapshot];
  }
  uint32_t context = _currentContextID ?: _candidateContextID;
  if (!context) {
    _producerRetirementFailure = OPChannelError(5, @"The uncertain publication still requires actual host surface-release proof.");
    [self reportError:_producerRetirementFailure];
    return [self snapshot];
  }
  NSMutableDictionary *payload = [[self nativeIdentity] mutableCopy];
  payload[@"contextID"] = @(context);
  _producerRetirementRemoveSubmitted = YES;
  NSError *failure = nil;
  if ([self performNative:@"removePresentation" payload:payload right:nil error:&failure]) _endAccepted = YES;
  if (!_surfaceDetached && failure) {
    _producerRetirementFailure = failure;
    _uncertainOperation = YES;
    [self reportError:failure];
  }
  return [self snapshot];
}
- (BOOL)cancelReservation:(NSError **)error {
  if (!NSThread.isMainThread) return OPFail(error, 1, @"Reservation cancellation requires its owner main thread.");
  if (_receivedPublish || _publishInFlight || _bridgeSessionId || _published) return OPFail(error, 4, @"A bound or publication-received producer reservation requires real source teardown.");
  [self closeCarrier];
  return YES;
}
- (void)closeCarrier {
  OPOnMain(^{
    if (self->_closed) return;
    self->_closed = YES;
    self->_ready = NO;
    [self finishStart:OPChannelError(4, @"The producer channel is closed.")];
    [self flushDetachReplies:OPChannelError(4, @"The carrier closed without an additional surface-detachment proof.")];
    // Reply callbacks enqueue onto this same listener queue before close does.
    [self->_listener close];
    if (self->_producerExitFD >= 0) { close(self->_producerExitFD); self->_producerExitFD = -1; }
    self->_operationHandler = nil;
    self->_errorHandler = nil;
  });
}
- (NSDictionary *)snapshot {
  NSMutableDictionary *value = [_identity mutableCopy];
  value[@"bridgeSessionId"] = _bridgeSessionId ?: NSNull.null;
  value[@"contextID"] = @(_currentContextID);
  value[@"channelReady"] = @(_ready);
  value[@"published"] = @(_published);
  value[@"publishReceived"] = @(_receivedPublish);
  value[@"publishInFlight"] = @(_publishInFlight);
  value[@"ending"] = @(_ending);
  value[@"surfaceDetached"] = @(_surfaceDetached);
  value[@"hostReleased"] = @(_hostReleased);
  value[@"operationUncertain"] = @(_uncertainOperation);
  value[@"live"] = @(self.isLive);
  value[@"closed"] = @(_closed);
  value[@"producerExitMonitorAvailable"] = @(_producerExitFD >= 0 || _producerExitConfirmed);
  value[@"producerExitConfirmed"] = @(_producerExitConfirmed);
  value[@"producerRetirementRequested"] = @(_producerRetirementRequested);
  value[@"producerRetirementRemoveSubmitted"] = @(_producerRetirementRemoveSubmitted);
  value[@"producerRetirementPending"] = @(_producerRetirementRequested && !_surfaceDetached);
  if (_producerExitConfirmed) value[@"producerExitProof"] = @{@"kind": @"kernel-note-exit", @"pid": _expectedProducer[@"pid"], @"euid": _expectedProducer[@"euid"], @"pidVersion": _expectedProducer[@"pidVersion"]};
  if (_producerExitMonitorFailure) value[@"producerExitMonitorError"] = _producerExitMonitorFailure.localizedDescription;
  if (_producerRetirementFailure) value[@"producerRetirementError"] = _producerRetirementFailure.localizedDescription;
  if (_pendingOperation) value[@"pendingOperationID"] = _pendingOperation[@"operationID"];
  return [value copy];
}
- (void)dealloc { if (_producerExitFD >= 0) close(_producerExitFD); [_listener close]; }
@end
