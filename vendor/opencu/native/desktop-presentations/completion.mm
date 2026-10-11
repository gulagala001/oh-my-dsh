#import "completion.h"

static CABasicAnimation *CompletionBasicAnimation(id fromValue, id toValue,
                                                 CFTimeInterval duration) {
  CABasicAnimation *animation = [CABasicAnimation animationWithKeyPath:@"opacity"];
  animation.fromValue = fromValue;
  animation.toValue = toValue;
  animation.duration = duration;
  return animation;
}

static CASpringAnimation *CompletionSpringAnimation(NSString *keyPath, id fromValue,
                                                    id toValue) {
  CASpringAnimation *animation = [CASpringAnimation animationWithKeyPath:keyPath];
  animation.fromValue = fromValue;
  animation.toValue = toValue;
  animation.mass = 1;
  animation.stiffness = 170;
  animation.damping = 18;
  animation.initialVelocity = 0;
  animation.duration = animation.settlingDuration;
  return animation;
}

static CGImageRef CompletionImage(NSImage *image) {
  if (!image) return nil;
  NSRect rect = NSMakeRect(0, 0, image.size.width, image.size.height);
  return [image CGImageForProposedRect:&rect context:nil hints:nil];
}

@interface OCUCompletionEffect () {
  CALayer *_scrimLayer;
  CALayer *_applicationIconLayer;
  CALayer *_iconDimLayer;
  CALayer *_checkmarkBackgroundLayer;
  CALayer *_checkmarkLayer;
  NSInteger _state;
  uint64_t _transitionGeneration;
}
@property(nonatomic, strong, readwrite) CALayer *layer;
@end

@implementation OCUCompletionEffect

- (instancetype)initWithApplicationIcon:(NSImage *)applicationIcon {
  CGImageRef applicationImage = CompletionImage(applicationIcon);
  NSImage *checkmark = [NSImage imageWithSystemSymbolName:@"checkmark"
                              accessibilityDescription:nil];
  checkmark = [checkmark imageWithSymbolConfiguration:
      [NSImageSymbolConfiguration configurationWithPointSize:18 weight:NSFontWeightBold]];
  CGImageRef checkmarkImage = CompletionImage(checkmark);
  if ((applicationIcon && !applicationImage) || !checkmarkImage) return nil;
  self = [super init];
  if (!self) return nil;

  _layer = CALayer.layer;
  _layer.name = @"remote-hosted-pip-completion";

  _scrimLayer = CALayer.layer;
  _scrimLayer.backgroundColor = NSColor.blackColor.CGColor;
  _scrimLayer.compositingFilter = @"sourceAtop";
  _scrimLayer.opacity = 0;

  _applicationIconLayer = CALayer.layer;
  _applicationIconLayer.contents = (__bridge id)applicationImage;
  _applicationIconLayer.contentsGravity = kCAGravityResizeAspect;
  _applicationIconLayer.opacity = 0;

  CALayer *applicationMask = CALayer.layer;
  applicationMask.contents = (__bridge id)applicationImage;
  applicationMask.contentsGravity = kCAGravityResizeAspect;
  _iconDimLayer = CALayer.layer;
  _iconDimLayer.backgroundColor = NSColor.blackColor.CGColor;
  _iconDimLayer.mask = applicationMask;
  _iconDimLayer.opacity = 0;

  _checkmarkBackgroundLayer = CALayer.layer;
  _checkmarkBackgroundLayer.backgroundColor =
      [NSColor colorWithRed:0 green:230.0 / 255.0 blue:45.0 / 255.0 alpha:1].CGColor;
  _checkmarkBackgroundLayer.cornerRadius = 8.75;
  _checkmarkBackgroundLayer.shadowColor = NSColor.blackColor.CGColor;
  _checkmarkBackgroundLayer.shadowOpacity = 0.8f;
  _checkmarkBackgroundLayer.shadowRadius = 4;
  _checkmarkBackgroundLayer.opacity = 0;

  CALayer *checkmarkMask = CALayer.layer;
  checkmarkMask.contents = (__bridge id)checkmarkImage;
  checkmarkMask.contentsGravity = kCAGravityResizeAspect;
  _checkmarkLayer = CALayer.layer;
  _checkmarkLayer.backgroundColor = NSColor.whiteColor.CGColor;
  _checkmarkLayer.mask = checkmarkMask;
  _checkmarkLayer.opacity = 0;

  _layer.sublayers = @[
    _scrimLayer, _applicationIconLayer, _iconDimLayer,
    _checkmarkBackgroundLayer, _checkmarkLayer
  ];
  return self;
}

- (void)showInSize:(NSSize)size {
  [self layoutInSize:size];
  _scrimLayer.opacity = 0.17f;
  CABasicAnimation *scrim = CompletionBasicAnimation(@0, @0.17, 0.35);
  scrim.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseOut];
  [_scrimLayer addAnimation:scrim forKey:@"completion-scrim-fade"];

  if (!_applicationIconLayer.contents) {
    [self showFullCheckmark];
    return;
  }

  _applicationIconLayer.opacity = 1;
  CABasicAnimation *icon = CompletionBasicAnimation(@0, @1, 0.35);
  icon.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseOut];
  [_applicationIconLayer addAnimation:icon forKey:@"completion-icon-fade"];

  uint64_t generation = ++_transitionGeneration;
  __weak OCUCompletionEffect *weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1000000000), dispatch_get_main_queue(), ^{
    OCUCompletionEffect *effect = weakSelf;
    if (!effect || effect->_transitionGeneration != generation) return;
    [effect showFullCheckmark];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1500000000), dispatch_get_main_queue(), ^{
      OCUCompletionEffect *current = weakSelf;
      if (!current || current->_transitionGeneration != generation) return;
      [current showMiniCheckmark];
    });
  });
}

- (void)layoutInSize:(NSSize)size {
  _layer.frame = NSMakeRect(0, 0, size.width, size.height);
  CGFloat iconX = (size.width - 50) * 0.5;
  CGFloat iconY = (size.height - 50) * 0.5;
  CGPoint center = CGPointMake(iconX + 25, iconY + 25);
  CGPoint miniCenter = CGPointMake(center.x + 18, center.y - 18);

  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  _scrimLayer.frame = _layer.bounds;
  _applicationIconLayer.frame = NSMakeRect(iconX, iconY, 50, 50);
  _iconDimLayer.frame = _applicationIconLayer.frame;
  _iconDimLayer.mask.frame = _iconDimLayer.bounds;
  _checkmarkLayer.bounds = NSMakeRect(0, 0, 18, 18);
  _checkmarkLayer.mask.frame = _checkmarkLayer.bounds;
  _checkmarkLayer.position = _state == 2 ? miniCenter : center;
  CGFloat scale = _state == 2 ? 0.5 : 1;
  _checkmarkLayer.transform = CATransform3DMakeScale(scale, scale, 1);
  _checkmarkBackgroundLayer.bounds = NSMakeRect(0, 0, 17.5, 17.5);
  _checkmarkBackgroundLayer.position = miniCenter;
  [CATransaction commit];
}

- (void)showFullCheckmark {
  if (_state != 0) return;
  _state = 1;
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  if (_applicationIconLayer.contents) _iconDimLayer.opacity = 0.65f;
  _checkmarkLayer.opacity = 1;
  _checkmarkLayer.backgroundColor = NSColor.whiteColor.CGColor;

  if (_applicationIconLayer.contents) {
    [_iconDimLayer addAnimation:CompletionBasicAnimation(@0, @0.65, 0.25)
                        forKey:@"completion-icon-dim-fade"];
  }
  [_checkmarkLayer addAnimation:CompletionSpringAnimation(@"transform.scale", @0.01, @1)
                        forKey:@"completion-checkmark-scale"];
  [_checkmarkLayer addAnimation:CompletionBasicAnimation(@0, @1, 0.2)
                        forKey:@"completion-checkmark-fade"];
  [CATransaction commit];
}

- (void)showMiniCheckmark {
  if (_state != 1) return;
  _state = 2;
  CGPoint fullPosition = _checkmarkLayer.position;
  CGPoint miniPosition = CGPointMake(fullPosition.x + 18, fullPosition.y - 18);
  NSValue *fromPosition = [NSValue valueWithPoint:fullPosition];
  NSValue *toPosition = [NSValue valueWithPoint:miniPosition];

  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  _iconDimLayer.opacity = 0;
  _checkmarkBackgroundLayer.opacity = 1;
  _checkmarkLayer.position = miniPosition;
  _checkmarkLayer.transform = CATransform3DMakeScale(0.5, 0.5, 1);
  _checkmarkLayer.backgroundColor = [NSColor colorWithCalibratedWhite:0 alpha:0.5].CGColor;
  [_iconDimLayer addAnimation:CompletionBasicAnimation(@0.65, @0, 0.25)
                      forKey:@"completion-icon-dim-fade"];
  [_checkmarkBackgroundLayer addAnimation:CompletionSpringAnimation(@"position", fromPosition, toPosition)
                                   forKey:@"completion-badge-position"];
  [_checkmarkBackgroundLayer addAnimation:CompletionSpringAnimation(@"transform.scale", @0.01, @1)
                                   forKey:@"completion-badge-scale"];
  [_checkmarkBackgroundLayer addAnimation:CompletionBasicAnimation(@0, @1, 0.2)
                                   forKey:@"completion-badge-fade"];
  [_checkmarkLayer addAnimation:CompletionSpringAnimation(@"position", fromPosition, toPosition)
                        forKey:@"completion-checkmark-position"];
  [_checkmarkLayer addAnimation:CompletionSpringAnimation(@"transform.scale", @1, @0.5)
                        forKey:@"completion-checkmark-scale"];
  [CATransaction commit];
}

- (void)stop {
  ++_transitionGeneration;
  [_layer removeAllAnimations];
  for (CALayer *sublayer in _layer.sublayers) [sublayer removeAllAnimations];
  [_layer removeFromSuperlayer];
}

@end
