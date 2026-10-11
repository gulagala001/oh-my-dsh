#import <Foundation/Foundation.h>
#import <ApplicationServices/ApplicationServices.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSString *const CUScreenLockErrorDomain;
FOUNDATION_EXPORT const NSTimeInterval CUScreenLockAuthorizationTimeout;
FOUNDATION_EXPORT const NSTimeInterval CUScreenLockPollInterval;
FOUNDATION_EXPORT const NSTimeInterval CUScreenLockSubmitDelay;
FOUNDATION_EXPORT const NSTimeInterval CUScreenLockVerificationDelay;
FOUNDATION_EXPORT const NSTimeInterval CUScreenLockUISettleDelay;
FOUNDATION_EXPORT const NSTimeInterval CUScreenLockUIFallbackDelay;

typedef NS_ENUM(NSInteger, CUScreenLockErrorCode) {
  CUScreenLockUnavailable = 1,
  CUScreenLockStateUnavailable,
  CUScreenLockSuppressed,
  CUScreenLockAttemptsExceeded,
  CUScreenLockCancelled,
  CUScreenLockPermissionDenied,
  CUScreenLockInvalidOwner,
  CUScreenLockAuthorizationRejected,
  CUScreenLockTimedOut,
};

// Values are the recovered byte representation, not inferred enum names.
typedef NS_ENUM(uint8_t, CULoginAuthorizationResolution) {
  CULoginAuthorizationConsumed = 0,
  CULoginAuthorizationRevoked = 1,
  CULoginAuthorizationExpired = 2,
  CULoginAuthorizationPending = 3,
};

@interface CULoginAuthorizationAttempt : NSObject
@property (nonatomic, readonly) CULoginAuthorizationResolution resolution;
- (void)revoke;
- (void)waitForResolutionWithTimeout:(NSTimeInterval)timeout
                         completion:(void (^)(CULoginAuthorizationResolution))completion;
@end

@interface CULoginAuthorizationBroker : NSObject
- (CULoginAuthorizationAttempt *)beginLoginAuthorizationAttempt;
// Only an authenticated OS authorization mechanism may call this method.
- (BOOL)consumePendingLoginAuthorizationAttempt;
- (void)revokePendingLoginAuthorizationAttempt;
- (NSDictionary *)snapshot;
@end

@protocol CUScreenLockCancellation <NSObject>
- (void)cancel;
@end

@protocol CUScreenLockInputOperation <CUScreenLockCancellation>
// Asynchronous: no input can be posted after this completion is delivered.
- (void)cancelWithCompletion:(dispatch_block_t)completion;
@end

@protocol CUScreenLockAuthorizedProvider <NSObject>
- (NSDictionary *)capabilities;
- (void)shutdownWithCompletion:(void (^)(NSError *_Nullable))completion;
- (nullable id<CUScreenLockCancellation>)startPhysicalInputMonitoring:(dispatch_block_t)handler
                                                               error:(NSError **)error;
- (nullable id<CUScreenLockCancellation>)acquireOverlayAssertionWithError:(NSError **)error;
- (nullable id<CUScreenLockCancellation>)observeLockUISettled:(void (^)(NSError *_Nullable))completion
                                                       error:(NSError **)error;
// The attempt starts at submission, after the login UI is prepared. Acceptance is synchronous.
- (nullable id<CUScreenLockInputOperation>)unlockWithBroker:(CULoginAuthorizationBroker *)broker
                                        acceptingAttempt:(BOOL (^)(CULoginAuthorizationAttempt *attempt))acceptingAttempt
                                               completion:(void (^)(BOOL didUnlock, NSError *_Nullable error))completion;
@end

@interface CUScreenLockController : NSObject
@property (nonatomic, readonly) BOOL isScreenLocked;
- (NSDictionary *)snapshot;
- (nullable NSNumber *)readLockedStateWithError:(NSError **)error;
- (void)requestRelockWithCompletion:(void (^)(NSError *_Nullable))completion;
@end

// One coordinator is shared by the daemon. Owner keys are immutable daemon connection IDs.
@interface CUScreenLockCoordinator : NSObject
@property (nonatomic, copy, nullable) void (^physicalInteractionHandler)(BOOL hadPendingUnlockGuard);
- (instancetype)initWithController:(CUScreenLockController *)controller
                            broker:(CULoginAuthorizationBroker *)broker
                          provider:(nullable id<CUScreenLockAuthorizedProvider>)provider
                           enabled:(BOOL (^)(void))enabled;
- (void)prepareForRequestForThread:(nullable NSString *)threadID
                            owner:(NSString *)ownerID
                       completion:(void (^)(BOOL didUnlock, NSError *_Nullable error))completion;
- (void)prepareForRequestForThread:(nullable NSString *)threadID
                            owner:(NSString *)ownerID
                        cancelled:(BOOL (^)(void))cancelled
                       completion:(void (^)(BOOL didUnlock, NSError *_Nullable error))completion;
- (void)turnEndedForThread:(NSString *)threadID owner:(NSString *)ownerID;
- (void)handlePhysicalUserInteraction;
- (void)serviceConnectionInvalidatedForOwner:(NSString *)ownerID
                                 completion:(void (^)(NSError *_Nullable))completion;
- (NSDictionary *)snapshot;
@end

NS_ASSUME_NONNULL_END
