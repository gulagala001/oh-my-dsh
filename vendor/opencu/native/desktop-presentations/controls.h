#pragma once

#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>

NS_ASSUME_NONNULL_BEGIN

/** Lead frame is content-view local; host anchor is screen space. Supply after the panel envelope. */
typedef struct {
  NSRect leadItemFrame;
  NSRect hostAnchorScreenFrame;
  NSInteger currentPlacement;
  NSInteger currentAlignment;
  NSInteger presentationScope;
  BOOL visible;
  BOOL aboveItem;
  BOOL docked;
} OCUPIPControlLayout;

/** Native fog, icon, label and contrast state; every method runs on the AppKit main thread. */
@interface OCUNativePIPControls : NSObject
@property(nonatomic, readonly, nullable) CALayer *fogContainerLayer;
@property(nonatomic, readonly, nullable) CALayer *hideControlLayer;
@property(nonatomic, readonly, nullable) CALayer *placementControlLayer;
@property(nonatomic, readonly) NSRect hideControlFrame;
@property(nonatomic, readonly) NSRect placementControlFrame;
@property(nonatomic, readonly) NSRect fogShapeFrame;
@property(nonatomic, readonly) NSArray<NSValue *> *toolTipRects;
@property(nonatomic, readonly) BOOL fogAvailable;
@property(nonatomic, readonly) BOOL placementIconAvailable;
@property(nonatomic, readonly) BOOL contrastSamplingActive;
@property(nonatomic, readonly) double controlRevealProgress;
@property(nonatomic, readonly) double controlIconWhiteAmount;
@property(nonatomic, copy) NSString *hideControlTitle;
/** Root connects this to the display-link contrast keepalive; it is silent after stop. */
@property(nonatomic, copy, nullable) void (^contrastSamplingChanged)(BOOL active);

/** Attaches only owned layers to the existing control view; placementIcon is the real native asset. */
- (nullable instancetype)initWithContentView:(NSView *)contentView
                               controlView:(NSView *)controlView
                              contentPanel:(NSPanel *)contentPanel
                              controlPanel:(NSPanel *)controlPanel
                             placementIcon:(nullable NSImage *)placementIcon;
/** Then refresh hover from the real current mouse point and the controller hit registries. */
- (void)updateLayout:(OCUPIPControlLayout)layout;
/** Presentation/resize hits come from the controller's actual item and resize-handle registries. */
- (void)updateHoverAtContentPoint:(NSPoint)point
                 hasPresentation:(BOOL)hasPresentation
                   resizeHandle:(BOOL)resizeHandle
                      resizing:(BOOL)resizing;
- (nullable NSString *)controlIdentifierAtPoint:(NSPoint)point;
- (void)clearHover;
- (void)requestContrastSample;
/** Uses the native window-server image; motion and resize flags preserve source sampling gates. */
- (void)updateContrastAtTimestamp:(double)timestamp
                           force:(BOOL)force
                     needsMotion:(BOOL)needsMotion
                        resizing:(BOOL)resizing;
- (void)stop;
@end

NS_ASSUME_NONNULL_END
