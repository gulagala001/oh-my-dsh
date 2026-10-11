#import "controls.h"
#import <CoreImage/CoreImage.h>
#import <objc/message.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <dlfcn.h>

static CALayer *CreateBackdrop() {
  Class klass = NSClassFromString(@"CABackdropLayer");
  if (!klass) return nil;
  CALayer *layer = [[klass alloc] init];
  SEL selector = NSSelectorFromString(@"setGroupName:");
  if ([layer respondsToSelector:selector]) ((void (*)(id, SEL, id))objc_msgSend)(layer, selector, NSUUID.UUID.UUIDString);
  selector = NSSelectorFromString(@"setScale:");
  if ([layer respondsToSelector:selector]) ((void (*)(id, SEL, double))objc_msgSend)(layer, selector, 1.0);
  for (NSString *name in @[@"setWindowServerAware:", @"setAllowsInPlaceFiltering:", @"setCaptureOnly:"]) {
    selector = NSSelectorFromString(name);
    if ([layer respondsToSelector:selector]) ((void (*)(id, SEL, BOOL))objc_msgSend)(layer, selector, [name isEqual:@"setWindowServerAware:"]);
  }
  return layer;
}

static id CreateLayerFilter(NSString *name) {
  Class klass = NSClassFromString(@"CAFilter");
  SEL selector = NSSelectorFromString(@"filterWithName:");
  return klass && [klass respondsToSelector:selector] ? ((id (*)(id, SEL, id))objc_msgSend)(klass, selector, name) : nil;
}

static void SetOpacity(CALayer *layer, float value, BOOL animated) {
  if (!layer) return;
  float previous = (layer.presentationLayer ?: layer).opacity;
  layer.opacity = value;
  if (!animated || std::abs(previous - value) < 0.001) return;
  [layer removeAnimationForKey:@"remoteHostedPIPControlOpacity"];
  CABasicAnimation *animation = [CABasicAnimation animationWithKeyPath:@"opacity"];
  animation.fromValue = @(previous);
  animation.toValue = @(value);
  animation.duration = 0.12;
  animation.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
  [layer addAnimation:animation forKey:@"remoteHostedPIPControlOpacity"];
}

static NSImage *RenderIcon(NSImage *image, NSSize requested, BOOL symbol) {
  if (!image) return nil;
  if (symbol) {
    NSImageSymbolConfiguration *font = [NSImageSymbolConfiguration configurationWithPointSize:std::min(requested.width, requested.height) weight:NSFontWeightHeavy scale:NSImageSymbolScaleLarge];
    NSImageSymbolConfiguration *color = [NSImageSymbolConfiguration configurationWithHierarchicalColor:NSColor.whiteColor];
    image = [image imageWithSymbolConfiguration:[font configurationByApplyingConfiguration:color]] ?: image;
  }
  NSSize source = image.size;
  if (std::min(source.width, source.height) <= 0) source = requested;
  double factor = std::min(requested.width / source.width, requested.height / source.height);
  double scale = NSScreen.mainScreen.backingScaleFactor;
  NSInteger pixels = std::max<NSInteger>(1, (NSInteger)(scale > 0 ? std::ceil(22 * scale) : 44));
  NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:nullptr pixelsWide:pixels pixelsHigh:pixels bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSCalibratedRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
  if (!bitmap) return image;
  bitmap.size = NSMakeSize(22, 22);
  NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
  if (!context) return image;
  NSRect drawing = NSMakeRect((22 - source.width * factor) / 2, (22 - source.height * factor) / 2 + (symbol ? 0 : -1), source.width * factor, source.height * factor);
  [NSGraphicsContext saveGraphicsState];
  @try {
    NSGraphicsContext.currentContext = context;
    context.imageInterpolation = NSImageInterpolationHigh;
    [NSColor.clearColor setFill];
    NSRectFillUsingOperation(NSMakeRect(0, 0, 22, 22), NSCompositingOperationCopy);
    [image drawInRect:drawing fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:NO hints:nil];
    [NSColor.whiteColor setFill];
    NSRectFillUsingOperation(drawing, NSCompositingOperationSourceIn);
  } @finally {
    [NSGraphicsContext restoreGraphicsState];
  }
  NSImage *result = [[NSImage alloc] initWithSize:NSMakeSize(22, 22)];
  [result addRepresentation:bitmap];
  return result;
}

static CIFilter *IconColor(CALayer *layer, double white) {
  CIFilter *filter = [CIFilter filterWithName:@"CIColorMatrix"];
  if (!filter) return nil;
  filter.name = @"remoteHostedPIPIconColor";
  [filter setDefaults];
  CIVector *zero = [CIVector vectorWithX:0 Y:0 Z:0 W:0];
  [filter setValue:zero forKey:@"inputRVector"];
  [filter setValue:zero forKey:@"inputGVector"];
  [filter setValue:zero forKey:@"inputBVector"];
  [filter setValue:[CIVector vectorWithX:0 Y:0 Z:0 W:1] forKey:@"inputAVector"];
  [filter setValue:[CIVector vectorWithX:white Y:white Z:white W:0] forKey:@"inputBiasVector"];
  layer.filters = @[filter];
  return filter;
}

static void SetIconColor(CIFilter *filter, CALayer *layer, CIVector *previous, CIVector *next, BOOL animated) {
  if (!filter) return;
  [filter setValue:next forKey:@"inputBiasVector"];
  if (!layer) return;
  NSString *keyPath = @"filters.remoteHostedPIPIconColor.inputBiasVector";
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  [layer setValue:next forKeyPath:keyPath];
  [CATransaction commit];
  if (!animated) return;
  CABasicAnimation *animation = [CABasicAnimation animationWithKeyPath:keyPath];
  animation.fromValue = previous;
  animation.toValue = next;
  animation.duration = 0.16;
  animation.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
  [layer addAnimation:animation forKey:@"remoteHostedPIPIconColor"];
}

static CGRect CGScreenRect(NSRect rect) {
  NSScreen *reference = nil;
  for (NSScreen *screen in NSScreen.screens) {
    if (NSPointInRect(NSZeroPoint, screen.frame)) { reference = screen; break; }
  }
  reference = reference ?: NSScreen.screens.firstObject;
  return CGRectMake(rect.origin.x, NSMaxY(reference ? reference.frame : NSZeroRect) - NSMaxY(rect), rect.size.width, rect.size.height);
}

@interface OCUNativePIPControls () {
  __weak NSView *_contentView;
  __weak NSView *_controlView;
  __weak NSPanel *_contentPanel;
  __weak NSPanel *_controlPanel;
  CALayer *_blurBackdrop;
  CALayer *_blurMaskSource;
  CALayer *_shadowBackdrop;
  CALayer *_shadowMask;
  CALayer *_shadowMaskSource;
  CALayer *_hideIcon;
  CATextLayer *_hideText;
  CALayer *_placementIcon;
  CIFilter *_hideColorFilter;
  CIFilter *_placementColorFilter;
  NSString *_hoveredControl;
  NSInteger _placement;
  BOOL _controlsVisible;
  BOOL _sampleRequested;
  BOOL _stopped;
  NSUInteger _whiteConfirmationCount;
  double _lastSampleTimestamp;
  double _lastColorChangeTimestamp;
}
@property(nonatomic, readwrite, nullable) CALayer *fogContainerLayer;
@property(nonatomic, readwrite, nullable) CALayer *hideControlLayer;
@property(nonatomic, readwrite, nullable) CALayer *placementControlLayer;
@property(nonatomic, readwrite) NSRect hideControlFrame;
@property(nonatomic, readwrite) NSRect placementControlFrame;
@property(nonatomic, readwrite) NSRect fogShapeFrame;
@property(nonatomic, readwrite) NSArray<NSValue *> *toolTipRects;
@property(nonatomic, readwrite) BOOL fogAvailable;
@property(nonatomic, readwrite) BOOL placementIconAvailable;
@property(nonatomic, readwrite) BOOL contrastSamplingActive;
@property(nonatomic, readwrite) double controlRevealProgress;
@property(nonatomic, readwrite) double controlIconWhiteAmount;
@end

@implementation OCUNativePIPControls
- (instancetype)initWithContentView:(NSView *)contentView controlView:(NSView *)controlView contentPanel:(NSPanel *)contentPanel controlPanel:(NSPanel *)controlPanel placementIcon:(NSImage *)placementIcon {
  self = [super init];
  if (!self || !contentView.layer || !controlView.layer) return nil;
  _contentView = contentView;
  _controlView = controlView;
  _contentPanel = contentPanel;
  _controlPanel = controlPanel;
  _hideControlTitle = @"";
  _toolTipRects = @[];
  _controlIconWhiteAmount = 1;
  _fogContainerLayer = CALayer.layer;
  _fogContainerLayer.hidden = YES;
  _fogContainerLayer.zPosition = 99999;
  [self makeFog];
  _hideControlLayer = [self buttonLayer];
  _placementControlLayer = [self buttonLayer];
  NSImage *hide = [NSImage imageWithSystemSymbolName:@"xmark" accessibilityDescription:nil];
  _hideIcon = [self iconLayer:hide requested:NSMakeSize(14, 14) symbol:YES parent:_hideControlLayer];
  _hideColorFilter = IconColor(_hideIcon, 1);
  _hideText = CATextLayer.layer;
  _hideText.alignmentMode = kCAAlignmentCenter;
  _hideText.contentsScale = NSScreen.mainScreen.backingScaleFactor;
  _hideText.hidden = YES;
  [_hideControlLayer addSublayer:_hideText];
  BOOL symbol = placementIcon == nil;
  NSImage *placement = placementIcon ?: [NSImage imageWithSystemSymbolName:@"out.to.pet" accessibilityDescription:nil];
  _placementIconAvailable = placement != nil;
  _placementIcon = [self iconLayer:placement requested:NSMakeSize(16, 16) symbol:symbol parent:_placementControlLayer];
  _placementColorFilter = IconColor(_placementIcon, 1);
  [controlView.layer addSublayer:_fogContainerLayer];
  [controlView.layer addSublayer:_hideControlLayer];
  [controlView.layer addSublayer:_placementControlLayer];
  return self;
}

- (CALayer *)buttonLayer {
  CALayer *layer = CALayer.layer;
  layer.bounds = NSMakeRect(0, 0, 22, 22);
  layer.hidden = YES;
  layer.masksToBounds = NO;
  layer.zPosition = 100000;
  return layer;
}

- (CALayer *)iconLayer:(NSImage *)image requested:(NSSize)requested symbol:(BOOL)symbol parent:(CALayer *)parent {
  CALayer *layer = CALayer.layer;
  layer.frame = NSMakeRect(0, 0, 22, 22);
  layer.contents = RenderIcon(image, requested, symbol);
  layer.contentsGravity = kCAGravityResize;
  layer.contentsScale = NSScreen.mainScreen.backingScaleFactor;
  layer.opacity = 0.7f;
  [parent addSublayer:layer];
  return layer;
}

- (void)makeFog {
  _blurBackdrop = CreateBackdrop();
  BOOL variable = NSProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26;
  id blur = CreateLayerFilter(variable ? @"variableBlur" : @"gaussianBlur");
  id maskBlur = CreateLayerFilter(@"gaussianBlur");
  if (_blurBackdrop && blur && maskBlur) {
    _blurBackdrop.filters = @[blur];
    _blurMaskSource = CALayer.layer;
    _blurMaskSource.backgroundColor = NSColor.blackColor.CGColor;
    _blurMaskSource.filters = @[maskBlur];
    [maskBlur setValue:@14.0 forKey:@"inputRadius"];
    [blur setValue:@6.0 forKey:@"inputRadius"];
    [blur setValue:@YES forKey:@"inputNormalizeEdges"];
    if (variable) {
      _blurMaskSource.name = [@"remote-hosted-pip-control-blur-mask-" stringByAppendingString:NSUUID.UUID.UUIDString];
      _blurMaskSource.opacity = 1;
      [_blurBackdrop addSublayer:_blurMaskSource];
      [blur setValue:@YES forKey:@"inputFade"];
      [blur setValue:_blurMaskSource.name forKey:@"inputSourceSublayerName"];
    } else {
      _blurBackdrop.mask = CALayer.layer;
      [_blurBackdrop.mask addSublayer:_blurMaskSource];
    }
    [_fogContainerLayer addSublayer:_blurBackdrop];
  }
  id curve = CreateLayerFilter(@"luminanceCurveMap");
  id alpha = CreateLayerFilter(@"luminanceToAlpha");
  if (curve && alpha) {
    [curve setValue:@[@0, @-1.75, @0.09, @2.4] forKey:@"inputValues"];
    [curve setValue:@1 forKey:@"inputAmount"];
    [alpha setValue:@NO forKey:@"inputPremultipliedValues"];
    _shadowBackdrop = CreateBackdrop();
    if (_shadowBackdrop) {
      _shadowBackdrop.filters = @[curve, alpha];
      _shadowBackdrop.opacity = 0.12f;
      _shadowMask = CALayer.layer;
      _shadowMask.masksToBounds = NO;
      _shadowBackdrop.mask = _shadowMask;
      _shadowMaskSource = CALayer.layer;
      _shadowMaskSource.backgroundColor = NSColor.blackColor.CGColor;
      _shadowMaskSource.opacity = 1;
      id shadowBlur = CreateLayerFilter(@"gaussianBlur");
      if (shadowBlur) {
        _shadowMaskSource.filters = @[shadowBlur];
        [shadowBlur setValue:@14.0 forKey:@"inputRadius"];
      }
      [_shadowMask addSublayer:_shadowMaskSource];
      [_fogContainerLayer addSublayer:_shadowBackdrop];
    }
  }
  _fogAvailable = _blurBackdrop.superlayer != nil && _shadowBackdrop.superlayer != nil;
}

- (void)updateLayout:(OCUPIPControlLayout)layout {
  if (_stopped) return;
  _placement = layout.currentPlacement;
  _controlsVisible = layout.visible;
  if (!layout.visible) {
    [self setReveal:0];
    _fogContainerLayer.hidden = YES;
    _hideControlLayer.hidden = YES;
    _placementControlLayer.hidden = YES;
    _hideControlFrame = NSZeroRect;
    _placementControlFrame = NSZeroRect;
    _fogShapeFrame = NSZeroRect;
    _toolTipRects = @[];
    [self setHoveredControl:nil];
    return;
  }
  NSFont *font = [NSFont systemFontOfSize:12 weight:NSFontWeightSemibold];
  double width = _placement == 0 ? std::max(22.0, std::ceil([_hideControlTitle sizeWithAttributes:@{NSFontAttributeName: font}].width) + 16) : 22;
  double x;
  if (layout.docked && layout.currentAlignment == 0 && layout.presentationScope == 1) {
    NSPoint screen = NSMakePoint(NSMaxX(layout.hostAnchorScreenFrame), NSMidY(layout.hostAnchorScreenFrame));
    NSPoint inWindow = [_controlPanel convertPointFromScreen:screen];
    x = [_controlView convertPoint:inWindow fromView:nil].x;
  } else {
    x = layout.aboveItem ? NSMinX(layout.leadItemFrame) - (_placement == 0 ? 8 : 4) : NSMinX(layout.leadItemFrame) + 6;
  }
  double y = NSMaxY(layout.leadItemFrame) + (layout.aboveItem ? 2 : -28);
  _hideControlFrame = NSMakeRect(x, y, width, 22);
  _placementControlFrame = _placement == 2 ? NSZeroRect : NSMakeRect(x + width + 1, y, 22, 22);
  _hideControlLayer.frame = _hideControlFrame;
  _placementControlLayer.frame = _placementControlFrame;
  _hideIcon.hidden = _placement == 0;
  _hideText.hidden = _placement != 0;
  _hideText.string = _hideControlTitle;
  _hideText.font = (__bridge CFTypeRef)font.fontName;
  _hideText.fontSize = font.pointSize;
  _hideText.foregroundColor = [NSColor colorWithWhite:_controlIconWhiteAmount alpha:1].CGColor;
  double textHeight = std::ceil(font.ascender - font.descender + font.leading);
  _hideText.frame = NSMakeRect(0, std::floor((22 - textHeight) / 2), width, textHeight);
  _toolTipRects = _placement == 2 ? @[[NSValue valueWithRect:_hideControlFrame]] : @[[NSValue valueWithRect:_hideControlFrame], [NSValue valueWithRect:_placementControlFrame]];
  _fogContainerLayer.frame = _controlView.bounds;
  NSRect controls = _placement == 2 ? _hideControlFrame : NSUnionRect(_hideControlFrame, _placementControlFrame);
  _fogShapeFrame = NSInsetRect(controls, -18, -10);
  [self applyReveal:NO];
}

- (void)setReveal:(double)value {
  value = std::clamp(value, 0.0, 1.0);
  if (std::abs(_controlRevealProgress - value) < 0.001) return;
  _controlRevealProgress = value;
  [self applyReveal:YES];
}

- (void)setHoveredControl:(NSString *)identifier {
  if (_hoveredControl == identifier || [_hoveredControl isEqual:identifier]) return;
  _hoveredControl = [identifier copy];
  [self applyReveal:NO];
}

- (void)applyReveal:(BOOL)animated {
  if (_stopped) return;
  NSRect shape = NSIsEmptyRect(_fogShapeFrame) ? NSZeroRect : _fogShapeFrame;
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  SetOpacity(_fogContainerLayer, (float)_controlRevealProgress, animated);
  SetOpacity(_hideControlLayer, (float)_controlRevealProgress, animated);
  SetOpacity(_placementControlLayer, (float)_controlRevealProgress, animated);
  _hideIcon.opacity = [_hoveredControl isEqual:@"hide"] ? 1 : 0.7f;
  _hideText.opacity = _hideIcon.opacity;
  _placementIcon.opacity = [_hoveredControl isEqual:@"placement"] ? 1 : 0.7f;
  _blurBackdrop.frame = NSInsetRect(shape, -22, -22);
  _blurBackdrop.cornerRadius = 0;
  _blurBackdrop.masksToBounds = NO;
  _blurBackdrop.mask.frame = _blurBackdrop.bounds;
  _blurMaskSource.frame = NSInsetRect(_blurBackdrop.bounds, 22, 22);
  _blurMaskSource.cornerRadius = _blurMaskSource.bounds.size.height / 2;
  _shadowBackdrop.frame = _blurBackdrop.frame;
  _shadowMask.frame = _shadowBackdrop.bounds;
  _shadowMaskSource.frame = _blurMaskSource.frame;
  _shadowMaskSource.cornerRadius = _blurMaskSource.cornerRadius;
  _fogContainerLayer.hidden = !_controlsVisible;
  _hideControlLayer.hidden = !_controlsVisible;
  _placementControlLayer.hidden = !_controlsVisible || _placement == 2;
  [CATransaction commit];
  if (_controlsVisible && _controlRevealProgress > 0.001 && [self shouldSample]) [self requestContrastSample];
  else [self stopSampling];
}

- (void)updateHoverAtContentPoint:(NSPoint)point hasPresentation:(BOOL)hasPresentation resizeHandle:(BOOL)resizeHandle resizing:(BOOL)resizing {
  if (_stopped || resizing) return;
  [self setReveal:hasPresentation || (_controlsVisible && NSPointInRect(point, _fogShapeFrame)) ? 1 : 0];
  [self setHoveredControl:resizeHandle ? nil : [self controlIdentifierAtPoint:point]];
}

- (NSString *)controlIdentifierAtPoint:(NSPoint)point {
  if (_stopped || !_controlsVisible || _controlRevealProgress <= 0.001) return nil;
  if (!_hideControlLayer.hidden && NSPointInRect(point, _hideControlFrame)) return @"hide";
  if (!_placementControlLayer.hidden && NSPointInRect(point, _placementControlFrame)) return @"placement";
  return nil;
}

- (void)clearHover {
  if (_stopped) return;
  [self setReveal:0];
  [self setHoveredControl:nil];
}

- (NSRect)sampleFrame {
  NSRect result = NSZeroRect;
  if (!NSIsEmptyRect(_hideControlFrame)) result = _placement == 0 ? _hideControlFrame : NSMakeRect(NSMidX(_hideControlFrame) - 7, NSMidY(_hideControlFrame) - 7, 14, 14);
  if (!NSIsEmptyRect(_placementControlFrame)) {
    NSRect placement = NSMakeRect(NSMidX(_placementControlFrame) - 8, NSMidY(_placementControlFrame) - 8, 16, 16);
    result = NSIsEmptyRect(result) ? placement : NSUnionRect(result, placement);
  }
  return result;
}

- (BOOL)shouldSample {
  return !_stopped && _contentPanel.windowNumber >= 1 && _controlPanel.windowNumber >= 1 && !NSIsEmptyRect([self sampleFrame]);
}

- (void)requestContrastSample {
  if (_stopped) return;
  _sampleRequested = YES;
  if (![self shouldSample]) return;
  if (!_contrastSamplingActive) {
    _contrastSamplingActive = YES;
    if (_contrastSamplingChanged) _contrastSamplingChanged(YES);
  }
}

- (void)stopSampling {
  if (!_contrastSamplingActive) return;
  _contrastSamplingActive = NO;
  _sampleRequested = NO;
  _whiteConfirmationCount = 0;
  _lastSampleTimestamp = 0;
  if (_contrastSamplingChanged) _contrastSamplingChanged(NO);
}

- (NSNumber *)backingLuminance {
  if (![self shouldSample]) return nil;
  NSRect inWindow = [_contentView convertRect:[self sampleFrame] toView:nil];
  CGRect capture = CGScreenRect([_contentPanel convertRectToScreen:inWindow]);
  if (CGRectIsEmpty(capture)) return nil;
  auto createImage = reinterpret_cast<CGImageRef (*)(CGRect, CGWindowListOption, CGWindowID, CGWindowImageOption)>(dlsym(RTLD_DEFAULT, "CGWindowListCreateImage"));
  if (!createImage) return nil;
  CGImageRef image = createImage(capture, (CGWindowListOption)4, (CGWindowID)_controlPanel.windowNumber, (CGWindowImageOption)9);
  if (!image) return nil;
  std::array<uint8_t, 24 * 12 * 4> pixels{};
  CGColorSpaceRef color = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(pixels.data(), 24, 12, 8, 96, color, (CGBitmapInfo)0x4001);
  CGColorSpaceRelease(color);
  if (!context) { CGImageRelease(image); return nil; }
  CGContextSetInterpolationQuality(context, kCGInterpolationMedium);
  CGContextDrawImage(context, CGRectMake(0, 0, 24, 12), image);
  CGContextRelease(context);
  CGImageRelease(image);
  double weighted = 0, total = 0;
  for (size_t offset = 0; offset < pixels.size(); offset += 4) {
    double alpha = pixels[offset + 3] / 255.0;
    if (alpha <= 0.05) continue;
    double red = std::min(1.0, pixels[offset] / 255.0 / alpha);
    double green = std::min(1.0, pixels[offset + 1] / 255.0 / alpha);
    double blue = std::min(1.0, pixels[offset + 2] / 255.0 / alpha);
    weighted += (red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha;
    total += alpha;
  }
  return total > 0 ? @(weighted / total) : nil;
}

- (void)setWhiteAmount:(double)value animated:(BOOL)animated {
  value = std::clamp(value, 0.0, 1.0);
  if (std::abs(_controlIconWhiteAmount - value) < 0.001) return;
  double previous = std::clamp(_controlIconWhiteAmount, 0.0, 1.0);
  CIVector *from = [CIVector vectorWithX:previous Y:previous Z:previous W:0];
  CIVector *to = [CIVector vectorWithX:value Y:value Z:value W:0];
  _controlIconWhiteAmount = value;
  _whiteConfirmationCount = 0;
  _lastColorChangeTimestamp = CACurrentMediaTime();
  SetIconColor(_hideColorFilter, _hideIcon, from, to, animated);
  SetIconColor(_placementColorFilter, _placementIcon, from, to, animated);
  _hideText.foregroundColor = [NSColor colorWithWhite:value alpha:1].CGColor;
}

- (void)updateContrastAtTimestamp:(double)timestamp force:(BOOL)force needsMotion:(BOOL)needsMotion resizing:(BOOL)resizing {
  if (_stopped) return;
  if (![self shouldSample]) { [self stopSampling]; return; }
  if (needsMotion || resizing) return;
  if (!force && !_sampleRequested && timestamp - _lastSampleTimestamp < 0.05) return;
  _sampleRequested = NO;
  _lastSampleTimestamp = timestamp;
  NSNumber *sample = [self backingLuminance];
  if (!sample) return;
  double luminance = sample.doubleValue;
  if (_controlIconWhiteAmount >= 0.5 && luminance > 0.74) {
    [self setWhiteAmount:0 animated:YES];
  } else if (_controlIconWhiteAmount < 0.5 && luminance < 0.56) {
    if (timestamp - _lastColorChangeTimestamp < 0.24) return;
    if (++_whiteConfirmationCount >= 3) [self setWhiteAmount:1 animated:YES];
  } else {
    _whiteConfirmationCount = 0;
  }
}

- (void)stop {
  if (_stopped) return;
  [self stopSampling];
  _contrastSamplingChanged = nil;
  _stopped = YES;
  CALayer *roots[] = {_fogContainerLayer, _hideControlLayer, _placementControlLayer};
  for (CALayer *root : roots) {
    [root removeAllAnimations];
    for (CALayer *child in root.sublayers) [child removeAllAnimations];
    [root removeFromSuperlayer];
  }
  _fogContainerLayer = nil;
  _hideControlLayer = nil;
  _placementControlLayer = nil;
  _blurBackdrop = nil;
  _blurMaskSource = nil;
  _shadowBackdrop = nil;
  _shadowMask = nil;
  _shadowMaskSource = nil;
  _hideIcon = nil;
  _hideText = nil;
  _placementIcon = nil;
  _hideColorFilter = nil;
  _placementColorFilter = nil;
  _hoveredControl = nil;
  _hideControlFrame = NSZeroRect;
  _placementControlFrame = NSZeroRect;
  _fogShapeFrame = NSZeroRect;
  _toolTipRects = @[];
  _controlsVisible = NO;
  _fogAvailable = NO;
  _placementIconAvailable = NO;
  _contrastSamplingActive = NO;
  _sampleRequested = NO;
  _whiteConfirmationCount = 0;
  _lastSampleTimestamp = 0;
  _lastColorChangeTimestamp = 0;
  _controlRevealProgress = 0;
  _controlIconWhiteAmount = 1;
}

- (void)dealloc { [self stop]; }
@end
