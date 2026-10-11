#import "WindowScreenshot.h"
#import <math.h>
#import <dlfcn.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

NSErrorDomain const CUWindowScreenshotErrorDomain=@"CUWindowScreenshotErrorDomain";

CGSize CUWindowScreenshotSizeForContext(CGRect bounds,double scale,BOOL legacy,BOOL normalize,double *pointsPerPixel){
  CGSize size=CGSizeMake(bounds.size.width*scale,bounds.size.height*scale);double inverse=1./scale;
  if(legacy){
    if(normalize&&scale>1){size.width/=scale;size.height/=scale;inverse=1.;}
    if(size.width<=0||size.height<=0)size=CGSizeMake(1,1);
    else{
      double factor=MIN(1.,2048./MAX(size.width,size.height));
      factor*=MIN(1.,768./MIN(size.width*factor,size.height*factor));
      size.width*=factor;size.height*=factor;inverse/=factor;
    }
  }
  if(pointsPerPixel)*pointsPerPixel=inverse;return size;
}

CGFloat CUWindowScreenshotContextScale(CGRect contextBounds){
  if(!NSThread.isMainThread){__block CGFloat scale;dispatch_sync(dispatch_get_main_queue(),^{scale=CUWindowScreenshotContextScale(contextBounds);});return scale;}
  NSArray<NSScreen *> *screens=NSScreen.screens;NSScreen *selected=screens.firstObject;
  if(!selected)return 2;
  CGRect intersection=CGRectIntersection(selected.frame,contextBounds);
  CGFloat area=intersection.size.width*intersection.size.height;
  for(NSScreen *screen in screens){
    CGRect candidate=CGRectIntersection(screen.frame,contextBounds);CGFloat candidateArea=candidate.size.width*candidate.size.height;
    if(area<candidateArea){selected=screen;area=candidateArea;}
  }
  return selected.backingScaleFactor;
}

@interface CUWindowScreenshotResult () {
  CGImageRef _image;
}
@property(nonatomic,readwrite) CGRect captureRect;
@property(nonatomic,readwrite) CGFloat pointPixelScale;
@property(nonatomic,readwrite) BOOL hardwareImage;
@property(nonatomic,readwrite,nullable) NSValue *requestedPixelSize;
- (instancetype)initWithImage:(CGImageRef)image rect:(CGRect)rect scale:(CGFloat)scale hardware:(BOOL)hardware;
@end

@implementation CUWindowScreenshotResult
- (instancetype)initWithImage:(CGImageRef)image rect:(CGRect)rect scale:(CGFloat)scale hardware:(BOOL)hardware {
  if((self=[super init])){_image=CGImageRetain(image);_captureRect=rect;_pointPixelScale=scale;_hardwareImage=hardware;}return self;
}
- (CGImageRef)image{return _image;}
- (CGSize)pixelSize{return CGSizeMake(CGImageGetWidth(_image),CGImageGetHeight(_image));}
- (BOOL)pointPixelScaleAvailable{return !_hardwareImage;}
- (void)dealloc{if(_image)CGImageRelease(_image);}
@end

static NSError *CUScreenshotError(CUWindowScreenshotError code,NSString *message){
  return [NSError errorWithDomain:CUWindowScreenshotErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey:message}];
}

static BOOL CUScreenshotValidWindowID(id value){
  if(![value isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NO;
  double number=[value doubleValue];return isfinite(number)&&number>=0&&number<=UINT32_MAX&&floor(number)==number;
}

static BOOL CUScreenshotAllOnScreen(NSArray<NSNumber *> *ids){
  CFArrayRef array=CGWindowListCreate(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements,kCGNullWindowID);
  NSMutableSet<NSNumber *> *onScreen=[NSMutableSet set];
  if(array){for(CFIndex i=0;i<CFArrayGetCount(array);i++)[onScreen addObject:@((CGWindowID)(uintptr_t)CFArrayGetValueAtIndex(array,i))];CFRelease(array);}
  for(NSNumber *number in ids)if(![onScreen containsObject:number])return NO;return YES;
}

static void CUScreenshotContent(NSArray<NSNumber *> *ids,void (^completion)(SCShareableContent *,NSError *)){
  NSMutableSet<NSNumber *> *ownWindowIDs=[NSMutableSet set];
  for(NSWindow *window in NSApp.orderedWindows)if(window.windowNumber>0&&window.isVisible)[ownWindowIDs addObject:@((CGWindowID)window.windowNumber)];
  BOOL ownProcess=YES;
  for(NSNumber *number in ids)if(![ownWindowIDs containsObject:number]){ownProcess=NO;break;}
  if(ownProcess){
    if(@available(macOS 14.4,*))[SCShareableContent getCurrentProcessShareableContentWithCompletionHandler:completion];
    else [SCShareableContent getShareableContentWithCompletionHandler:completion];
  }else if(CUScreenshotAllOnScreen(ids)){
    [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES completionHandler:completion];
  }else [SCShareableContent getShareableContentWithCompletionHandler:completion];
}

static void CUScreenshotWithContent(SCShareableContent *content,NSArray<NSNumber *> *ids,BOOL hasAdditional,
  NSValue *imageSize,BOOL opaque,BOOL shadow,void (^completion)(CUWindowScreenshotResult *,NSError *)){
  NSMutableDictionary<NSNumber *,SCWindow *> *windows=[NSMutableDictionary dictionary];
  for(SCWindow *window in content.windows)windows[@(window.windowID)]=window;
  SCWindow *single=ids.count==1?windows[ids.firstObject]:nil;
  SCWindow *main=windows[ids.firstObject];
  SCWindow *hardwareWindow=single&&!single.onScreen?single:(hasAdditional&&main&&!main.onScreen?main:nil);
  if(hardwareWindow){
    NSArray *hardwareIDs=single?@[@(single.windowID)]:ids;
    CGImageRef image=CUWindowScreenshotCreateHardwareImage(hardwareIDs,hardwareWindow.frame);
    if(!image){completion(nil,CUScreenshotError(CUWindowScreenshotSourceImageUnavailable,@"Source hardware capture returned no image."));return;}
    if(imageSize){CGImageRef scaled=CUWindowScreenshotCreateResampledImage(image,imageSize.sizeValue);if(scaled){CGImageRelease(image);image=scaled;}}
    CUWindowScreenshotResult *result=[[CUWindowScreenshotResult alloc]initWithImage:image rect:hardwareWindow.frame scale:NAN hardware:YES];
    result.requestedPixelSize=imageSize;
    CGImageRelease(image);completion(result,nil);return;
  }
  SCContentFilter *filter;CGRect rect;CGRect sourceRect=CGRectNull;
  if(single){filter=[[SCContentFilter alloc]initWithDesktopIndependentWindow:single];rect=single.frame;}
  else{
    NSMutableArray<SCWindow *> *included=[NSMutableArray array];
    for(NSNumber *number in ids){SCWindow *window=windows[number];if(window)[included addObject:window];}
    rect=CGRectNull;
    if(hasAdditional&&main)rect=main.frame;
    else for(SCWindow *window in included)rect=CGRectUnion(rect,window.frame);
    SCDisplay *display=content.displays.firstObject;
    if(!display){completion(nil,CUScreenshotError(CUWindowScreenshotSourceImageUnavailable,@"Source shareable content has no display."));return;}
    for(SCDisplay *candidate in content.displays){
      CGRect current=CGRectIntersection(display.frame,rect),next=CGRectIntersection(candidate.frame,rect);
      if(current.size.width*current.size.height<next.size.width*next.size.height)display=candidate;
    }
    sourceRect=CGRectOffset(rect,-display.frame.origin.x,-display.frame.origin.y);
    filter=[[SCContentFilter alloc]initWithDisplay:display includingWindows:included];
  }
  SCStreamConfiguration *configuration=[SCStreamConfiguration new];
  configuration.ignoreShadowsSingleWindow=!shadow;configuration.ignoreShadowsDisplay=YES;
  configuration.showsCursor=NO;configuration.shouldBeOpaque=opaque;
  CGFloat scale=filter.pointPixelScale;
  CGSize requested=imageSize?imageSize.sizeValue:CGSizeMake(rect.size.width*scale,rect.size.height*scale);
  size_t width,height;
  if(!CUWindowScreenshotPixelDimensions(requested,&width,&height)){
    completion(nil,CUScreenshotError(CUWindowScreenshotInvalidPixelSize,@"Source screenshot pixel dimensions are invalid."));return;
  }
  configuration.width=width;configuration.height=height;
  if(!single)configuration.sourceRect=sourceRect;
  if(@available(macOS 14.0,*)){
    [SCScreenshotManager captureImageWithFilter:filter configuration:configuration completionHandler:^(CGImageRef image,NSError *error){
      NSError *failure=error;CUWindowScreenshotResult *result=nil;
      if(!failure){
        if(image){result=[[CUWindowScreenshotResult alloc]initWithImage:image rect:rect scale:scale hardware:NO];result.requestedPixelSize=[NSValue valueWithSize:requested];}
        else failure=CUScreenshotError(CUWindowScreenshotSourceCallbackInvariant,@"Source capture callback supplied neither image nor error.");
      }
      dispatch_async(dispatch_get_main_queue(),^{completion(result,failure);});
    }];
  }else completion(nil,CUScreenshotError(CUWindowScreenshotCaptureAPIUnavailable,@"Source SCScreenshotManager API is unavailable."));
}

void CUWindowScreenshotCapture(CGWindowID selectedWindowID,NSArray<NSNumber *> *additionalWindowIDs,NSValue *imageSize,
  BOOL opaque,BOOL includesWindowShadow,void (^completion)(CUWindowScreenshotResult *,NSError *)){
  if(imageSize&&strcmp(imageSize.objCType,@encode(CGSize))!=0){completion(nil,CUScreenshotError(CUWindowScreenshotInvalidRequest,@"Source image size must be a CGSize value."));return;}
  NSMutableArray<NSNumber *> *ids=[NSMutableArray arrayWithObject:@(selectedWindowID)];
  for(id value in additionalWindowIDs){if(!CUScreenshotValidWindowID(value)){completion(nil,CUScreenshotError(CUWindowScreenshotInvalidRequest,@"Additional source window ID is invalid."));return;}[ids addObject:value];}
  NSArray *capturedIDs=[ids copy];
  BOOL hasAdditional=additionalWindowIDs.count!=0;
  dispatch_async(dispatch_get_main_queue(),^{CUScreenshotContent(capturedIDs,^(SCShareableContent *content,NSError *error){
    dispatch_async(dispatch_get_main_queue(),^{
      if(error){completion(nil,error);return;}
      if(!content){completion(nil,CUScreenshotError(CUWindowScreenshotSourceCallbackInvariant,@"Source content callback supplied neither content nor error."));return;}
      CUScreenshotWithContent(content,capturedIDs,hasAdditional,imageSize,opaque,includesWindowShadow,completion);
    });
  });});
}

BOOL CUWindowScreenshotPixelDimensions(CGSize size,size_t *width,size_t *height){
  if(!isfinite(size.width)||!isfinite(size.height)||size.width<=0||size.height<=0)return NO;
  double w=ceil(size.width),h=ceil(size.height);
  if(w>=0x1p63||h>=0x1p63)return NO;
  if(width)*width=(size_t)w;if(height)*height=(size_t)h;return YES;
}

CGImageRef CUWindowScreenshotCreateResampledImage(CGImageRef image,CGSize size){
  if(!image)return NULL;CGColorSpaceRef color=CGImageGetColorSpace(image);if(!color)return NULL;
  if((double)CGImageGetWidth(image)==size.width&&(double)CGImageGetHeight(image)==size.height)return CGImageRetain(image);
  if(!isfinite(size.width)||!isfinite(size.height)||size.width<=0||size.height<=0||size.width>=0x1p63||size.height>=0x1p63)return NULL;
  size_t width=(size_t)size.width,height=(size_t)size.height;
  CGContextRef context=CGBitmapContextCreate(NULL,width,height,CGImageGetBitsPerComponent(image),0,color,CGImageGetBitmapInfo(image));if(!context)return NULL;
  CGContextSetInterpolationQuality(context,kCGInterpolationHigh);CGContextDrawImage(context,CGRectMake(0,0,width,height),image);
  CGImageRef result=CGBitmapContextCreateImage(context);CGContextRelease(context);return result;
}

CGImageRef CUWindowScreenshotCreateHardwareImage(NSArray<NSNumber *> *windowIDs,CGRect bounds){
  typedef void *(*MainConnection)(void);
  typedef NSArray *(*CaptureWindowListInRect)(void *,const uint32_t *,int32_t,uint32_t,CGRect);
  static MainConnection mainConnection;static CaptureWindowListInRect capture;static dispatch_once_t once;
  dispatch_once(&once,^{void *image=dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",RTLD_LAZY|RTLD_LOCAL);if(image){mainConnection=(MainConnection)dlsym(image,"CGSMainConnectionID");capture=(CaptureWindowListInRect)dlsym(image,"_SLSHWCaptureWindowListInRect");}});
  if(!mainConnection||!capture||!windowIDs.count||windowIDs.count>INT32_MAX)return NULL;
  NSMutableData *ids=[NSMutableData dataWithLength:windowIDs.count*sizeof(uint32_t)];uint32_t *values=ids.mutableBytes;
  for(NSUInteger i=0;i<windowIDs.count;i++){id value=windowIDs[i];if(![value isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NULL;double number=[value doubleValue];if(!isfinite(number)||number<0||number>UINT32_MAX||floor(number)!=number)return NULL;values[i]=[value unsignedIntValue];}
  NSArray *images=capture(mainConnection(),values,(int32_t)windowIDs.count,2048,bounds);
  if(![images isKindOfClass:NSArray.class]||!images.count)return NULL;id image=images.firstObject;
  if(!image||CFGetTypeID((__bridge CFTypeRef)image)!=CGImageGetTypeID())return NULL;return CGImageRetain((__bridge CGImageRef)image);
}
