#import <Foundation/Foundation.h>
#import <sys/types.h>

NS_ASSUME_NONNULL_BEGIN
FOUNDATION_EXPORT BOOL CUVerifyScreenLockSocketPeer(int socketFD, NSString *requirement,
                                                   uid_t expectedUID, NSError **error);
FOUNDATION_EXPORT NSString *_Nullable CUScreenLockSigningRequirement(NSString *identifier,
                                                                    NSString *teamIdentifier,
                                                                    NSError **error);
FOUNDATION_EXPORT NSString *_Nullable CUScreenLockPinnedSigningRequirement(NSString *identifier,
                                                                          NSString *certificateSHA1,
                                                                          NSError **error);
NS_ASSUME_NONNULL_END
