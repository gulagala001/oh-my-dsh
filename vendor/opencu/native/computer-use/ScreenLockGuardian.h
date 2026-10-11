#import "ScreenLockUnlock.h"

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSString *const CUScreenUnlockConfigurationPath;
FOUNDATION_EXPORT NSString *const CUScreenUnlockInstalledPluginPath;

@interface CUOwnScreenLockGuardianResources : NSObject <CUScreenLockGuardianResources>
- (instancetype)initWithController:(CUScreenLockController *)controller ignoredProcessID:(pid_t)pid;
- (void)cancelAll;
@end

// Only the fixed root-owned setup configuration is accepted; callers cannot select a path.
FOUNDATION_EXPORT id<CUScreenLockAuthorizedProvider> _Nullable CUCreateConfiguredScreenLockProvider(
  CUScreenLockController *controller, CULoginAuthorizationBroker *broker, NSError **error);
FOUNDATION_EXPORT NSDictionary *CUScreenUnlockConfigurationStatus(void);

NS_ASSUME_NONNULL_END
