#import "ScreenLock.h"
#import "ScreenLockIdentity.h"
#import <sys/types.h>

NS_ASSUME_NONNULL_BEGIN

// Started only by the installation/provider path with a trusted, immutable policy.
@interface CULoginAuthorizationServer : NSObject <CUScreenLockCancellation>
- (instancetype)initWithBroker:(CULoginAuthorizationBroker *)broker;
- (BOOL)startAtSocketPath:(NSString *)socketPath
      OSAgentRequirement:(NSString *)requirement
                  error:(NSError **)error;
- (void)shutdownWithCompletion:(void (^)(NSError *_Nullable))completion;
- (NSDictionary *)snapshot;
@end

NS_ASSUME_NONNULL_END
