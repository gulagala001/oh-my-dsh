#import <Foundation/Foundation.h>
#import <mach/mach.h>
#include <sys/types.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSErrorDomain const CUMachChannelErrorDomain;
FOUNDATION_EXPORT const NSUInteger CUMachChannelMaximumJSONBytes;
FOUNDATION_EXPORT const NSUInteger CUMachChannelMaximumInFlight;
FOUNDATION_EXPORT NSData *CUMachCreateNonce(void);
// Read the calling task's kernel audit token. Never synthesizes a PID version.
FOUNDATION_EXPORT NSDictionary<NSString *, NSNumber *> * _Nullable CUMachCurrentProcessIdentity(NSError **error);

typedef NS_ERROR_ENUM(CUMachChannelErrorDomain, CUMachChannelError) {
    CUMachChannelErrorInvalidConfiguration = 1,
    CUMachChannelErrorBootstrap,
    CUMachChannelErrorClosed,
    CUMachChannelErrorTransport,
    CUMachChannelErrorProtocol,
    CUMachChannelErrorUnauthorized,
    CUMachChannelErrorCapacity,
    CUMachChannelErrorTimeout,
    CUMachChannelErrorRemote,
};

// Owns one real send-right reference. The port property is borrowed.
@interface CUMachSendRight : NSObject
@property(nonatomic, readonly) mach_port_t port;
+ (nullable instancetype)retainedSendRightWithPort:(mach_port_t)port error:(NSError **)error;
// The caller owns the returned +1 send reference and must mach_port_deallocate it.
- (mach_port_t)copySendRightWithError:(NSError **)error;
- (void)invalidate;
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
@end

@interface CUMachRequest : NSObject
@property(nonatomic, readonly, copy) NSString *requestID;
@property(nonatomic, readonly, copy) NSString *operation;
@property(nonatomic, readonly, copy) NSDictionary<NSString *, id> *metadata;
@property(nonatomic, readonly, nullable) CUMachSendRight *sendRight;
@property(nonatomic, readonly) pid_t peerPID;
@property(nonatomic, readonly) uid_t peerEUID;
@property(nonatomic, readonly) int peerPIDVersion;
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
@end

// All callbacks run on the main queue. A reply callback may be called once,
// asynchronously from any queue. Keep sendRight alive while its borrowed port is used.
typedef void (^CUMachReply)(NSDictionary<NSString *, id> * _Nullable metadata,
                            CUMachSendRight * _Nullable sendRight,
                            NSError * _Nullable error);
typedef void (^CUMachRequestHandler)(CUMachRequest *request, CUMachReply reply);
typedef void (^CUMachCompletion)(NSDictionary<NSString *, id> * _Nullable metadata,
                                 CUMachSendRight * _Nullable sendRight,
                                 NSError * _Nullable error);
typedef void (^CUMachErrorHandler)(NSError *error);
typedef void (^CUMachStartCompletion)(NSError * _Nullable error);

@interface CUMachListener : NSObject
// Random per-instance bootstrap name, available before start. Send this name and
// nonce to the helper only through the trusted process-launch channel.
@property(nonatomic, readonly, copy) NSString *serviceName;
- (nullable instancetype)initWithExpectedPeerPID:(pid_t)peerPID
                                           euid:(uid_t)peerEUID
                                     pidVersion:(int)peerPIDVersion
                                          nonce:(NSData *)nonce
                              allowedOperations:(NSSet<NSString *> *)allowedOperations
                                    maxInFlight:(NSUInteger)maxInFlight
                                        handler:(CUMachRequestHandler)handler
                                   errorHandler:(CUMachErrorHandler _Nullable)errorHandler
                                          error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (void)startWithCompletion:(CUMachStartCompletion)completion;
- (void)close;
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
@end

@interface CUMachClient : NSObject
- (nullable instancetype)initWithServiceName:(NSString *)serviceName
                            expectedPeerPID:(pid_t)peerPID
                                       euid:(uid_t)peerEUID
                                 pidVersion:(int)peerPIDVersion
                                      nonce:(NSData *)nonce
                          allowedOperations:(NSSet<NSString *> *)allowedOperations
                                maxInFlight:(NSUInteger)maxInFlight
                               errorHandler:(CUMachErrorHandler _Nullable)errorHandler
                                      error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (void)startWithCompletion:(CUMachStartCompletion)completion;
// timeout is seconds in (0, 300]. One send only; timeout never retries the operation.
- (void)sendRequestOperation:(NSString *)operation
                   metadata:(NSDictionary<NSString *, id> *)metadata
                  sendRight:(CUMachSendRight * _Nullable)sendRight
                    timeout:(NSTimeInterval)timeout
                 completion:(CUMachCompletion)completion;
- (void)close;
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
@end

NS_ASSUME_NONNULL_END
