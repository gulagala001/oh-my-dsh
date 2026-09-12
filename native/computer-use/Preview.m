#import "ComputerUse.h"
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <dlfcn.h>

static NSDictionary *CUBounds(CGRect r){return @{@"x":@(r.origin.x),@"y":@(r.origin.y),@"width":@(r.size.width),@"height":@(r.size.height)};}
static void CUPreviewFailure(NSError *error){
  NSString *code=@"CAPTURE_UNAVAILABLE";
  if([error.domain isEqual:SCStreamErrorDomain]){if(error.code==SCStreamErrorUserStopped)code=@"CAPTURE_STOPPED_BY_USER";else if(error.code==SCStreamErrorNoCaptureSource)code=@"STALE_WINDOW";else if(error.code==SCStreamErrorFailedApplicationConnectionInterrupted)code=@"CAPTURE_INTERRUPTED";}
  CUFail(code,error.localizedDescription);
}
static NSData *CUPreviewEncode(CGImageRef image){
  NSMutableData *data=[NSMutableData new];CGImageDestinationRef destination=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data,CFSTR("public.jpeg"),1,NULL);if(!destination)return nil;
  CGImageDestinationAddImage(destination,image,(__bridge CFDictionaryRef)@{(id)kCGImageDestinationLossyCompressionQuality:@.84});BOOL complete=CGImageDestinationFinalize(destination);CFRelease(destination);return complete?data:nil;
}
static SCStreamConfiguration *CUPreviewConfiguration(CGRect bounds){
  double scale=MIN(1.,1600./MAX(bounds.size.width,bounds.size.height));
  SCStreamConfiguration *config=[SCStreamConfiguration new];config.width=MAX(1,llround(bounds.size.width*scale));config.height=MAX(1,llround(bounds.size.height*scale));
  config.minimumFrameInterval=CMTimeMake(1,15);config.queueDepth=3;config.pixelFormat=kCVPixelFormatType_32BGRA;config.showsCursor=NO;config.capturesAudio=NO;
  config.ignoreShadowsSingleWindow=YES;config.captureResolution=SCCaptureResolutionNominal;config.colorSpaceName=kCGColorSpaceSRGB;config.streamName=@"Oh My DSH · 实时画面";
  return config;
}
static NSData *CUPreviewJPEG(CVPixelBufferRef buffer){
  if(CVPixelBufferLockBaseAddress(buffer,kCVPixelBufferLock_ReadOnly)!=kCVReturnSuccess)return nil;
  CGColorSpaceRef color=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context=CGBitmapContextCreate(CVPixelBufferGetBaseAddress(buffer),CVPixelBufferGetWidth(buffer),CVPixelBufferGetHeight(buffer),8,CVPixelBufferGetBytesPerRow(buffer),color,kCGBitmapByteOrder32Little|kCGImageAlphaPremultipliedFirst);
  CGColorSpaceRelease(color);NSData *result=nil;
  if(context){CGImageRef image=CGBitmapContextCreateImage(context);CGContextRelease(context);if(image){
    result=CUPreviewEncode(image);CGImageRelease(image);
  }}
  CVPixelBufferUnlockBaseAddress(buffer,kCVPixelBufferLock_ReadOnly);return result;
}

@interface CUPreview : NSObject <SCStreamOutput,SCStreamDelegate>
@property CUWindow *target;
@property SCStream *stream;
@property NSCondition *condition;
@property dispatch_queue_t frames;
@property dispatch_source_t captureTimer;
@property NSData *previousBytes;
@property BOOL quartz;
@property NSDictionary *latest;
@property NSError *failure;
@property CGRect wantedBounds;
@property CGRect configuredBounds;
@property NSUInteger sequence;
@property NSUInteger generation;
@property BOOL reconfiguring;
@property BOOL stopped;
@property BOOL stopFinished;
@property BOOL startFinished;
@property BOOL stopRequested;
@property BOOL paused;
- (void)updateBounds:(CGRect)bounds;
- (BOOL)stop;
- (void)requestStop;
- (void)startQuartz;
- (void)captureQuartz;
@end
@implementation CUPreview
- (instancetype)init {if((self=[super init])){_condition=[NSCondition new];_frames=dispatch_queue_create("ai.trisoul.computer-use.preview",DISPATCH_QUEUE_SERIAL);}return self;}
- (void)updateBounds:(CGRect)bounds {
  [self.condition lock];self.wantedBounds=bounds;
  if(self.quartz){self.configuredBounds=bounds;[self.condition unlock];return;}
  if(self.stopped||self.reconfiguring||CGSizeEqualToSize(bounds.size,self.configuredBounds.size)){[self.condition unlock];return;}
  self.reconfiguring=YES;self.latest=nil;self.generation++;[self.condition unlock];
  [self.stream updateConfiguration:CUPreviewConfiguration(bounds) completionHandler:^(NSError *error){
    [self.condition lock];self.reconfiguring=NO;if(error)self.failure=error;else self.configuredBounds=bounds;CGRect latest=self.wantedBounds;[self.condition broadcast];[self.condition unlock];
    if(!error)[self updateBounds:latest];
  }];
}
- (void)startQuartz {
  self.quartz=YES;self.startFinished=YES;
  self.captureTimer=dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER,0,0,self.frames);__weak CUPreview *weak=self;
  dispatch_source_set_event_handler(self.captureTimer,^{[weak captureQuartz];});
  dispatch_source_set_cancel_handler(self.captureTimer,^{CUPreview *strong=weak;if(!strong)return;[strong.condition lock];strong.captureTimer=nil;strong.stopFinished=YES;[strong.condition broadcast];[strong.condition unlock];});
  dispatch_source_set_timer(self.captureTimer,dispatch_time(DISPATCH_TIME_NOW,0),NSEC_PER_SEC/15,NSEC_PER_MSEC);dispatch_resume(self.captureTimer);
}
- (void)captureQuartz {
  [self.condition lock];BOOL stopped=self.stopped;[self.condition unlock];if(stopped)return;
  typedef CGImageRef (*WindowImage)(CGRect,CGWindowListOption,CGWindowID,CGWindowImageOption);
  static WindowImage capture;static dispatch_once_t once;dispatch_once(&once,^{capture=(WindowImage)dlsym(RTLD_DEFAULT,"CGWindowListCreateImage");});if(!capture)return;
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,self.target.windowId));CGRect before=CGRectNull;BOOL visible=NO;
  for(NSDictionary *window in windows)if([window[(id)kCGWindowOwnerPID]intValue]==self.target.pid&&CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],&before)){visible=[window[(id)kCGWindowIsOnscreen]boolValue];break;}
  if(CGRectIsNull(before)||CGRectIsEmpty(before)||!visible){[self.condition lock];self.paused=YES;self.latest=nil;self.previousBytes=nil;[self.condition broadcast];[self.condition unlock];return;}
  CGImageRef image=capture(CGRectNull,kCGWindowListOptionIncludingWindow,self.target.windowId,kCGWindowImageBoundsIgnoreFraming|kCGWindowImageNominalResolution);if(!image)return;
  CGRect after=CGRectNull;windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,self.target.windowId));
  for(NSDictionary *window in windows)if([window[(id)kCGWindowOwnerPID]intValue]==self.target.pid){CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],&after);break;}
  if(!CGRectEqualToRect(before,after)||fabs(CGImageGetWidth(image)-before.size.width)>1||fabs(CGImageGetHeight(image)-before.size.height)>1){CGImageRelease(image);return;}
  double scale=MIN(1.,1600./MAX(CGImageGetWidth(image),CGImageGetHeight(image)));size_t width=MAX(1,llround(CGImageGetWidth(image)*scale)),height=MAX(1,llround(CGImageGetHeight(image)*scale));
  if(scale<1){
    CGColorSpaceRef color=CGColorSpaceCreateWithName(kCGColorSpaceSRGB);CGContextRef context=CGBitmapContextCreate(NULL,width,height,8,0,color,kCGImageAlphaPremultipliedLast);CGColorSpaceRelease(color);
    if(!context){CGImageRelease(image);return;}CGContextSetInterpolationQuality(context,kCGInterpolationHigh);CGContextDrawImage(context,CGRectMake(0,0,width,height),image);CGImageRelease(image);image=CGBitmapContextCreateImage(context);CGContextRelease(context);if(!image)return;
  }
  NSData *bytes=CUPreviewEncode(image);CGImageRelease(image);if(!bytes)return;
  [self.condition lock];
  if(!self.stopped){
    self.paused=NO;
    if(![bytes isEqual:self.previousBytes]||![self.latest[@"bounds"]isEqual:CUBounds(before)]){
      self.previousBytes=bytes;self.sequence++;
      self.latest=@{@"sequence":@(self.sequence),@"data":[bytes base64EncodedStringWithOptions:0],@"mediaType":@"image/jpeg",@"pixelWidth":@(width),@"pixelHeight":@(height),@"bounds":CUBounds(before),@"geometryVerified":@YES,@"capturedAt":@([[NSDate date]timeIntervalSince1970]*1000)};
    }
    [self.condition broadcast];
  }[self.condition unlock];
}
- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sample ofType:(SCStreamOutputType)type {
  if(type!=SCStreamOutputTypeScreen||!CMSampleBufferIsValid(sample))return;
  NSArray *attachments=(__bridge NSArray *)CMSampleBufferGetSampleAttachmentsArray(sample,NO);NSDictionary *info=attachments.firstObject;
  SCFrameStatus status=[info[SCStreamFrameInfoStatus]integerValue];
  [self.condition lock];
  if(self.stopped||self.reconfiguring){[self.condition unlock];return;}
  if(status==SCFrameStatusIdle){[self.condition broadcast];[self.condition unlock];return;}
  if(status!=SCFrameStatusComplete&&status!=SCFrameStatusStarted){self.paused=YES;self.latest=nil;[self.condition broadcast];[self.condition unlock];return;}
  NSUInteger generation=self.generation;CGRect configured=self.configuredBounds,wanted=self.wantedBounds;[self.condition unlock];
  CVPixelBufferRef buffer=CMSampleBufferGetImageBuffer(sample);if(!buffer)return;
  SCStreamConfiguration *config=CUPreviewConfiguration(configured);
  if(CVPixelBufferGetWidth(buffer)!=config.width||CVPixelBufferGetHeight(buffer)!=config.height)return;
  CGRect bounds=wanted;id screen=info[SCStreamFrameInfoScreenRect];BOOL verified=NO;CGRect reported;
  if([screen isKindOfClass:NSDictionary.class])verified=CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)screen,&reported);
  else if([screen isKindOfClass:NSValue.class]&&strcmp([screen objCType],@encode(CGRect))==0){[screen getValue:&reported size:sizeof(reported)];verified=YES;}
  if(verified&&reported.size.width>0&&reported.size.height>0)bounds=reported;else verified=NO;
  if(!verified)return;
  // A resized source can arrive in the preceding output configuration. Never
  // label its scaled/letterboxed pixels as a stable frame of the new geometry.
  if(fabs(bounds.size.width-configured.size.width)>1||fabs(bounds.size.height-configured.size.height)>1)return;
  NSData *jpeg=CUPreviewJPEG(buffer);if(!jpeg)return;
  [self.condition lock];
  if(!self.stopped&&!self.reconfiguring&&generation==self.generation){
    self.paused=NO;self.sequence++;
    self.latest=@{@"sequence":@(self.sequence),@"data":[jpeg base64EncodedStringWithOptions:0],@"mediaType":@"image/jpeg",@"pixelWidth":@(CVPixelBufferGetWidth(buffer)),@"pixelHeight":@(CVPixelBufferGetHeight(buffer)),@"bounds":CUBounds(bounds),@"geometryVerified":@(verified),@"capturedAt":@([[NSDate date]timeIntervalSince1970]*1000)};
    [self.condition broadcast];
  }[self.condition unlock];
}
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
  [self.condition lock];if(!self.stopped)self.failure=error;self.latest=nil;self.stopFinished=YES;[self.condition broadcast];[self.condition unlock];
}
- (void)requestStop {
  [self.condition lock];BOOL request=self.startFinished&&!self.stopFinished&&!self.stopRequested;if(request)self.stopRequested=YES;[self.condition unlock];
  if(request&&self.quartz){dispatch_source_cancel(self.captureTimer);return;}
  if(request)[self.stream stopCaptureWithCompletionHandler:^(NSError *error){[self.condition lock];self.stopRequested=NO;self.stopFinished=self.stopFinished||error==nil;[self.condition broadcast];[self.condition unlock];}];
}
- (BOOL)stop {
  [self.condition lock];self.stopped=YES;self.latest=nil;[self.condition broadcast];[self.condition unlock];[self requestStop];
  NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:2];[self.condition lock];
  while(!self.stopFinished&&[deadline timeIntervalSinceNow]>0)[self.condition waitUntilDate:deadline];BOOL finished=self.stopFinished;[self.condition unlock];
  if(finished){SCStream *stream=self.stream;[stream removeStreamOutput:self type:SCStreamOutputTypeScreen error:nil];self.stream=nil;}return finished;
}
@end

NSDictionary *CUStartPreview(CUSession *session,NSDictionary *args){
  if(session.preview)CUFail(@"PREVIEW_ACTIVE",@"This connection already has a window preview.");
  if(!CGPreflightScreenCaptureAccess())CUFail(@"SCREEN_RECORDING_PERMISSION",@"Enable Screen Recording for Oh My DSH Computer Use.");
  CUWindow *target=CUResolveWindow(session,args);
  if(![args[@"process_identity"]isEqual:target.processIdentity])CUFail(@"STALE_PROCESS",@"Re-select the application before opening its live view.");
  // macOS 14's ReplayKit connection can stop responding after helper restarts.
  // Use its supported window-only Quartz path, as model screenshots already do.
  if(@available(macOS 15.0,*)){}else{
    CUPreview *preview=[CUPreview new];preview.target=target;preview.wantedBounds=target.bounds;preview.configuredBounds=target.bounds;session.preview=preview;[preview startQuartz];
    return CUResult(@{@"backend":@"quartz",@"pid":@(target.pid),@"window_id":@(target.windowId),@"process_identity":target.processIdentity});
  }
  __block SCShareableContent *content;__block NSError *failure;dispatch_semaphore_t ready=dispatch_semaphore_create(0);
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO completionHandler:^(SCShareableContent *value,NSError *error){content=value;failure=error;dispatch_semaphore_signal(ready);}];
  if(dispatch_semaphore_wait(ready,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC)))CUFail(@"CAPTURE_TIMEOUT",@"Window capture did not become ready.");[session check];
  if(failure)CUPreviewFailure(failure);
  SCWindow *window=nil;for(SCWindow *candidate in content.windows)if(candidate.windowID==target.windowId&&candidate.owningApplication.processID==target.pid){window=candidate;break;}
  if(!window)CUFail(@"STALE_WINDOW",@"The selected application window is no longer available.");
  CUPreview *preview=[CUPreview new];preview.target=target;preview.wantedBounds=target.bounds;preview.configuredBounds=target.bounds;
  SCContentFilter *filter=[[SCContentFilter alloc]initWithDesktopIndependentWindow:window];
  preview.stream=[[SCStream alloc]initWithFilter:filter configuration:CUPreviewConfiguration(target.bounds) delegate:preview];
  NSError *outputError;if(![preview.stream addStreamOutput:preview type:SCStreamOutputTypeScreen sampleHandlerQueue:preview.frames error:&outputError])CUFail(@"CAPTURE_UNAVAILABLE",outputError.localizedDescription?:@"Could not attach the window video output.");
  session.preview=preview;
  [preview.stream startCaptureWithCompletionHandler:^(NSError *error){
    [preview.condition lock];failure=error;preview.startFinished=YES;if(error){preview.failure=error;preview.stopFinished=YES;}BOOL stopped=preview.stopped;[preview.condition broadcast];[preview.condition unlock];
    if(stopped)[preview requestStop];dispatch_semaphore_signal(ready);
  }];
  if(dispatch_semaphore_wait(ready,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC)))CUFail(@"CAPTURE_TIMEOUT",@"Window video capture did not start in time.");
  if(failure)CUPreviewFailure(failure);[session check];
  return CUResult(@{@"backend":@"screencapturekit",@"pid":@(target.pid),@"window_id":@(target.windowId),@"process_identity":target.processIdentity});
}
NSDictionary *CUReadPreview(CUSession *session,NSDictionary *args){
  CUPreview *preview=session.preview;if(!preview)CUFail(@"PREVIEW_CLOSED",@"The application preview is not connected.");
  CUWindow *target=preview.target;
  if(![CUIdentity(target.pid)isEqual:target.processIdentity])CUFail(@"STALE_PROCESS",@"The selected application restarted.");
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,target.windowId));BOOL found=NO,visible=NO;
  for(NSDictionary *window in windows)if([window[(id)kCGWindowOwnerPID]intValue]==target.pid&&[window[(id)kCGWindowNumber]unsignedIntValue]==target.windowId){CGRect bounds;if(CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],&bounds)&&bounds.size.width>0&&bounds.size.height>0){target.bounds=bounds;found=YES;visible=[window[(id)kCGWindowIsOnscreen]boolValue];break;}}
  if(found&&!visible&&preview.quartz){for(NSDictionary *window in CUWindows(@(target.pid)))if([window[@"window_id"]unsignedIntValue]==target.windowId&&[window[@"is_application_window"]isEqual:@NO]){found=NO;break;}}
  if(!found)CUFail(@"STALE_WINDOW",@"The selected application window closed.");[preview updateBounds:target.bounds];
  NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:.1];NSUInteger after=[args[@"after"]unsignedIntegerValue];
  NSMutableDictionary *frame;
  [preview.condition lock];
  @try{
    while(!preview.failure&&!preview.stopped&&(!preview.latest||preview.sequence<=after)&&[deadline timeIntervalSinceNow]>0){[session check];[preview.condition waitUntilDate:deadline];}
    [session check];
    if(preview.failure)CUPreviewFailure(preview.failure);
    if(preview.stopped)CUFail(@"PREVIEW_CLOSED",@"The application preview was closed.");
    frame=[@{@"status":preview.paused?@"paused":preview.latest?@"live":@"waiting",@"sequence":@(preview.sequence),@"backend":preview.quartz?@"quartz":@"screencapturekit"}mutableCopy];
    if(preview.latest&&preview.sequence>after)[frame addEntriesFromDictionary:preview.latest];
  }@finally{[preview.condition unlock];}
  frame[@"cursor"]=CUCursorSnapshot(target.pid,target.windowId)?:NSNull.null;
  return @{@"structuredContent":frame,@"content":@[]};
}
BOOL CUStopPreview(CUSession *session){CUPreview *preview=session.preview;if(!preview)return YES;BOOL stopped=[preview stop];if(stopped)session.preview=nil;return stopped;}
