#import "ScreenLockAuthorization.h"

NS_ASSUME_NONNULL_BEGIN

@protocol CUScreenLockGuardianResources <NSObject>
- (NSDictionary *)capabilities;
- (nullable id<CUScreenLockCancellation>)startPhysicalInputMonitoring:(dispatch_block_t)handler error:(NSError **)error;
- (nullable id<CUScreenLockCancellation>)acquireOverlayAssertionWithError:(NSError **)error;
- (nullable id<CUScreenLockCancellation>)observeLockUISettled:(void (^)(NSError *_Nullable))completion error:(NSError **)error;
- (void)cancelAllWithCompletion:(dispatch_block_t)completion;
@end

// Initialization alone never makes the provider available. Installed code, the OS right,
// authenticated socket server, and live guardian resources are checked before every attempt.
@interface CUAuthorizedScreenLockProvider : NSObject <CUScreenLockAuthorizedProvider>
- (instancetype)initWithController:(CUScreenLockController *)controller
               authorizationServer:(CULoginAuthorizationServer *)authorizationServer
                 guardianResources:(id<CUScreenLockGuardianResources>)guardianResources
                  installedPlugin:(NSURL *)installedPlugin
                  pluginIdentifier:(NSString *)pluginIdentifier
                    teamIdentifier:(NSString *)teamIdentifier
                         mechanism:(NSString *)mechanism;
- (instancetype)initWithController:(CUScreenLockController *)controller
               authorizationServer:(CULoginAuthorizationServer *)authorizationServer
                 guardianResources:(id<CUScreenLockGuardianResources>)guardianResources
                  installedPlugin:(NSURL *)installedPlugin
                  pluginIdentifier:(NSString *)pluginIdentifier
                   certificateSHA1:(NSString *)certificateSHA1
                         mechanism:(NSString *)mechanism;
@end

NS_ASSUME_NONNULL_END
