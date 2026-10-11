#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>

NS_ASSUME_NONNULL_BEGIN

@interface OCUCompletionEffect : NSObject
@property(nonatomic, strong, readonly) CALayer *layer;
- (nullable instancetype)initWithApplicationIcon:(nullable NSImage *)applicationIcon;
- (void)showInSize:(NSSize)size;
- (void)layoutInSize:(NSSize)size;
- (void)showFullCheckmark;
- (void)showMiniCheckmark;
- (void)stop;
@end

NS_ASSUME_NONNULL_END
