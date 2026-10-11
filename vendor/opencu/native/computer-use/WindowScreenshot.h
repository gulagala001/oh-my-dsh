#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSErrorDomain const CUWindowScreenshotErrorDomain;
FOUNDATION_EXPORT CGFloat CUWindowScreenshotContextScale(CGRect contextBounds);
FOUNDATION_EXPORT CGSize CUWindowScreenshotSizeForContext(CGRect contextBounds, double scale,
  BOOL legacySizing, BOOL normalizeToPoints, double *pointsPerPixel);
typedef NS_ERROR_ENUM(CUWindowScreenshotErrorDomain, CUWindowScreenshotError) {
  CUWindowScreenshotInvalidPixelSize = 1,
  CUWindowScreenshotSourceImageUnavailable,
  CUWindowScreenshotSourceCallbackInvariant,
  CUWindowScreenshotInvalidRequest,
  CUWindowScreenshotCaptureAPIUnavailable
};

@interface CUWindowScreenshotResult : NSObject
@property(nonatomic,readonly) CGImageRef image;
@property(nonatomic,readonly) CGRect captureRect;
@property(nonatomic,readonly) CGSize pixelSize;
@property(nonatomic,readonly,nullable) NSValue *requestedPixelSize;
@property(nonatomic,readonly) CGFloat pointPixelScale;
@property(nonatomic,readonly) BOOL pointPixelScaleAvailable;
@property(nonatomic,readonly) BOOL hardwareImage;
@end

// The caller supplies the actual selected/override capture ID and source-owned
// additional IDs. Image size nil preserves the source's natural pixel size.
// captureRect is capture geometry, not the controller's independent visibleRect.
FOUNDATION_EXPORT void CUWindowScreenshotCapture(CGWindowID selectedWindowID,
  NSArray<NSNumber *> *additionalWindowIDs, NSValue * _Nullable imageSize,
  BOOL opaque, BOOL includesWindowShadow,
  void (^completion)(CUWindowScreenshotResult * _Nullable, NSError * _Nullable));

// Source screenshot configuration uses ceil-rounded positive pixel sizes,
// not nearest-pixel rounding or a one-pixel substitute for invalid sizes.
FOUNDATION_EXPORT BOOL CUWindowScreenshotPixelDimensions(CGSize size, size_t *width, size_t *height);
// Preserves the source image's color space, component depth and bitmap info.
// A missing color space or failed bitmap allocation returns NULL.
FOUNDATION_EXPORT CGImageRef _Nullable CUWindowScreenshotCreateResampledImage(CGImageRef image, CGSize size) CF_RETURNS_RETAINED;
// Source alternate image producer. This does not select a capture mode by OS
// version; the source pipeline selects it from the actual window state.
FOUNDATION_EXPORT CGImageRef _Nullable CUWindowScreenshotCreateHardwareImage(NSArray<NSNumber *> *windowIDs, CGRect bounds) CF_RETURNS_RETAINED;

NS_ASSUME_NONNULL_END
