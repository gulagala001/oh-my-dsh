#import "ComputerUse.h"
#import "PreviewProducer.h"
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <dlfcn.h>
#import <math.h>

static NSDictionary *CUBounds(CGRect r){return @{@"x":@(r.origin.x),@"y":@(r.origin.y),@"width":@(r.size.width),@"height":@(r.size.height)};}
static BOOL CUPreviewReadWindowBounds(CUWindow *target,CGRect *bounds){
  NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,target.windowId));
  for(NSDictionary *window in windows)if([window[(id)kCGWindowOwnerPID]intValue]==target.pid&&[window[(id)kCGWindowNumber]unsignedIntValue]==target.windowId){CGRect value;if(CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],&value)&&value.size.width>0&&value.size.height>0){*bounds=value;return YES;}}
  return NO;
}
static NSNumber *CUPreviewOptionalWindowID(id value){
  if(![value isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return nil;
  double number=[value doubleValue];return isfinite(number)&&number>=0&&number<=UINT32_MAX&&floor(number)==number?@([value unsignedIntValue]):nil;
}
static CUPreviewWindowContextProvider CUPreviewWindowProvider;
void CUSetPreviewWindowContextProvider(CUPreviewWindowContextProvider provider){@synchronized(CUSession.class){CUPreviewWindowProvider=[provider copy];}}
static NSDictionary *CUPreviewWindowContext(CUSession *session,CUWindow *target){
  NSCAssert(NSThread.isMainThread,@"Window ownership belongs to the native owner main thread.");
  CUPreviewWindowContextProvider provider;@synchronized(CUSession.class){provider=CUPreviewWindowProvider;}
  NSDictionary *context=provider?provider(session,target):nil;
  if(![context isKindOfClass:NSDictionary.class]||[context[@"pid"]intValue]!=target.pid||![context[@"processIdentity"]isEqual:target.processIdentity]||![CUIdentity(target.pid)isEqual:target.processIdentity])return nil;
  NSDictionary *windows=context[@"windows"];if(![windows isKindOfClass:NSDictionary.class])return nil;
  for(id key in windows){id element=windows[key];NSNumber *windowID=CUPreviewOptionalWindowID(key);if(!windowID.unsignedIntValue||!element||CFGetTypeID((__bridge CFTypeRef)element)!=AXUIElementGetTypeID())return nil;pid_t pid=0;if(AXUIElementGetPid((__bridge AXUIElementRef)element,&pid)!=kAXErrorSuccess||pid!=target.pid||CUAXWindowId((__bridge AXUIElementRef)element)!=windowID.unsignedIntValue)return nil;}
  if(![context[@"presentationWindowIDs"]isKindOfClass:NSArray.class])return nil;
  for(id value in context[@"presentationWindowIDs"])if(!CUPreviewOptionalWindowID(value))return nil;
  return context;
}
static NSArray<NSNumber *> *CUPreviewAssociatedWindowServerIDs(uint32_t windowID){
  typedef int32_t (*MainConnection)(void);typedef CFArrayRef (*CopyAssociatedWindows)(int32_t,uint32_t);
  static MainConnection mainConnection;static CopyAssociatedWindows copyAssociated;static dispatch_once_t once;
  dispatch_once(&once,^{void *image=dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",RTLD_LAZY|RTLD_LOCAL);if(image){mainConnection=(MainConnection)dlsym(image,"SLSMainConnectionID");copyAssociated=(CopyAssociatedWindows)dlsym(image,"SLSCopyAssociatedWindows");}});
  if(!mainConnection||!copyAssociated)return @[];NSArray *values=CFBridgingRelease(copyAssociated(mainConnection(),windowID));if(![values isKindOfClass:NSArray.class])return @[];
  NSMutableArray *ids=[NSMutableArray new];for(id value in values)if([value isKindOfClass:NSNumber.class])[ids addObject:@([value unsignedIntValue])];return ids;
}
NSNumber *CUPreviewParentWindowID(uint32_t windowID,NSDictionary *context){
  NSDictionary *windows=context[@"windows"];id current=windows[@(windowID)];
  for(NSUInteger depth=0;current&&depth<300;depth++){
    id parent=CUAX((__bridge AXUIElementRef)current,kAXParentAttribute);if(!parent||CFGetTypeID((__bridge CFTypeRef)parent)!=AXUIElementGetTypeID())break;
    if([CUAX((__bridge AXUIElementRef)parent,kAXRoleAttribute)isEqual:@"AXWindow"]){uint32_t parentID=CUAXWindowId((__bridge AXUIElementRef)parent);if(windows[@(parentID)])return @(parentID);break;}
    current=parent;
  }
  NSArray *presentations=[context[@"presentationWindowIDs"]isKindOfClass:NSArray.class]?context[@"presentationWindowIDs"]:@[];
  for(NSNumber *owner in presentations)if(owner.unsignedIntValue!=windowID&&windows[owner]&&[CUPreviewAssociatedWindowServerIDs(owner.unsignedIntValue)containsObject:@(windowID)])return owner;
  if([presentations containsObject:@(windowID)])return nil;
  for(NSNumber *associated in CUPreviewAssociatedWindowServerIDs(windowID)){
    id element=windows[associated];if(associated.unsignedIntValue==windowID||!element)continue;
    if([CUAX((__bridge AXUIElementRef)element,kAXRoleAttribute)isEqual:@"AXWindow"]&&![CUAX((__bridge AXUIElementRef)element,kAXSubroleAttribute)isEqual:@"AXFloatingWindow"])return associated;
  }
  return nil;
}
NSNumber *CUPreviewOwnerWindowID(uint32_t windowID,NSString *role,NSString *subrole,BOOL isModal,NSNumber *parentWindowID,NSNumber *mostRecentWindowID,NSNumber *mainWindowID,NSNumber *existingParentWindowID){
  NSNumber *owner=nil;
  if([role isEqual:@"AXSheet"])owner=parentWindowID?:existingParentWindowID;
  else if([role isEqual:@"AXWindow"]){
    if(parentWindowID)owner=parentWindowID;
    else if([subrole isEqual:@"AXDialog"]&&isModal){for(NSNumber *candidate in @[mostRecentWindowID?:NSNull.null,mainWindowID?:NSNull.null]){if(![candidate isKindOfClass:NSNumber.class])continue;uint32_t value=candidate.unsignedIntValue;if(value&&value!=windowID){owner=candidate;break;}}}
  }
  uint32_t value=owner.unsignedIntValue;return value&&value!=windowID?@(value):nil;
}
NSNumber *CUPreviewExistingParentWindowID(NSDictionary *context){
  NSArray *presentations=context[@"presentationWindowIDs"];NSDictionary *windows=context[@"windows"];
  NSNumber *recent=CUPreviewOptionalWindowID(context[@"mostRecentWindowID"]),*main=CUPreviewOptionalWindowID(context[@"mainWindowID"]);
  if(recent&&windows[recent]&&[presentations containsObject:recent])return recent;
  return main&&[presentations containsObject:main]?main:nil;
}
NSArray<NSNumber *> *CUPreviewAssociatedWindowIDs(NSDictionary *context,CUWindow *target){
  NSDictionary *windows=context[@"windows"];if(![windows isKindOfClass:NSDictionary.class])return nil;
  NSMutableArray *associated=[NSMutableArray new];NSNumber *existingParent=CUPreviewExistingParentWindowID(context);
  for(NSNumber *windowID in windows){
    uint32_t value=windowID.unsignedIntValue;if(value==target.windowId)continue;
    NSArray *info=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow,value));NSDictionary *windowInfo=nil;for(NSDictionary *candidate in info)if([candidate[(id)kCGWindowNumber]unsignedIntValue]==value){windowInfo=candidate;break;}
    if(!windowInfo||![windowInfo[(id)kCGWindowIsOnscreen]boolValue])continue;
    AXUIElementRef element=(__bridge AXUIElementRef)windows[windowID];
    NSNumber *owner=CUPreviewOwnerWindowID(value,CUAX(element,kAXRoleAttribute),CUAX(element,kAXSubroleAttribute),[CUAX(element,kAXModalAttribute)boolValue],CUPreviewParentWindowID(value,context),CUPreviewOptionalWindowID(context[@"mostRecentWindowID"]),CUPreviewOptionalWindowID(context[@"mainWindowID"]),existingParent);
    if(owner.unsignedIntValue==target.windowId)[associated addObject:windowID];
  }
  [associated sortUsingComparator:^NSComparisonResult(NSNumber *left,NSNumber *right){uint32_t a=left.unsignedIntValue,b=right.unsignedIntValue;return a<b?NSOrderedAscending:a>b?NSOrderedDescending:NSOrderedSame;}];return associated;
}
static BOOL CUPreviewAssociatedIDsValid(id values){
  if(![values isKindOfClass:NSArray.class])return NO;
  for(id value in values){if(![value isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NO;double number=[value doubleValue];if(!isfinite(number)||number<1||number>UINT32_MAX||floor(number)!=number)return NO;}
  return YES;
}
static void CUPreviewFailure(NSError *error){
  NSString *code=@"CAPTURE_UNAVAILABLE";
  if([error.domain isEqual:SCStreamErrorDomain]){if(error.code==SCStreamErrorUserStopped)code=@"CAPTURE_STOPPED_BY_USER";else if(error.code==SCStreamErrorNoCaptureSource)code=@"STALE_WINDOW";else if(error.code==SCStreamErrorFailedApplicationConnectionInterrupted)code=@"CAPTURE_INTERRUPTED";}
  CUFail(code,error.localizedDescription);
}
static NSData *CUPreviewEncode(CGImageRef image){
  NSMutableData *data=[NSMutableData new];CGImageDestinationRef destination=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data,CFSTR("public.jpeg"),1,NULL);if(!destination)return nil;
  CGImageDestinationAddImage(destination,image,(__bridge CFDictionaryRef)@{(id)kCGImageDestinationLossyCompressionQuality:@.84});BOOL complete=CGImageDestinationFinalize(destination);CFRelease(destination);return complete?data:nil;
}
static SCStreamConfiguration *CUPreviewConfiguration(CGRect bounds,double scale){
  double width=ceil(CGRectGetWidth(bounds)*scale),height=ceil(CGRectGetHeight(bounds)*scale);
  if(!isfinite(width)||!isfinite(height)||width>=0x1p63||height>=0x1p63)CUFail(@"CAPTURE_GEOMETRY",@"The capture source dimensions are not representable.");
  SCStreamConfiguration *config=[SCStreamConfiguration new];config.width=MAX(1,(NSInteger)width);config.height=MAX(1,(NSInteger)height);
  config.minimumFrameInterval=CMTimeMake(1,60);config.queueDepth=5;config.pixelFormat=kCVPixelFormatType_32BGRA;config.showsCursor=NO;
  config.ignoreShadowsSingleWindow=YES;config.ignoreShadowsDisplay=YES;
  return config;
}
static double CUPreviewWindowScale(CGRect bounds){
  __block double scale=2.;
  dispatch_block_t lookup=^{
    NSScreen *selected=nil;double largest=-INFINITY;
    for(NSScreen *screen in NSScreen.screens){CGRect intersection=CGRectIntersection(bounds,screen.frame);double area=intersection.size.width*intersection.size.height;if(!selected||area>largest){selected=screen;largest=area;}}
    if(selected)scale=selected.backingScaleFactor;
  };
  if(NSThread.isMainThread)lookup();else dispatch_sync(dispatch_get_main_queue(),lookup);
  return MAX(1.,scale);
}
@interface CUPreviewCaptureGeometry : NSObject
@property SCContentFilter *filter;
@property SCStreamConfiguration *configuration;
@property CGRect sourceBounds;
@property double scale;
@property BOOL includesAssociatedWindows;
@property CGRect targetBounds;
@property NSArray *cursorCaptureKey;
@end
@implementation CUPreviewCaptureGeometry
@end
static SCDisplay *CUPreviewSelectDisplay(NSArray<SCDisplay *> *displays,CGRect target,CGRect preferred){
  SCDisplay *(^best)(CGRect)=^SCDisplay *(CGRect rect){SCDisplay *selected=nil;double largest=0.;for(SCDisplay *display in displays){CGRect intersection=CGRectIntersection(rect,display.frame);double area=CGRectGetWidth(intersection)*CGRectGetHeight(intersection);if(area>largest){selected=display;largest=area;}}return selected;};
  SCDisplay *selected=best(preferred);return selected&&CGRectIntersectsRect(target,selected.frame)?selected:best(target);
}
static CUPreviewCaptureGeometry *CUPreviewGeometry(SCShareableContent *content,CUWindow *target,NSArray<NSNumber *> *associatedIDs){
  SCWindow *selected=nil;
  for(SCWindow *window in content.windows)if(window.windowID==target.windowId&&window.owningApplication.processID==target.pid){selected=window;break;}
  if(!selected)return nil;
  NSMutableArray<SCWindow *> *associated=[NSMutableArray new];
  for(SCWindow *window in content.windows){
    if(![associatedIDs containsObject:@(window.windowID)]||!window.isOnScreen||!selected.owningApplication)continue;
    SCRunningApplication *candidateOwner=window.owningApplication,*selectedOwner=selected.owningApplication;
    if((candidateOwner&&selectedOwner&&candidateOwner.processID==selectedOwner.processID)||(!candidateOwner&&!selectedOwner))[associated addObject:window];
  }
  CUPreviewCaptureGeometry *geometry=[CUPreviewCaptureGeometry new];geometry.sourceBounds=target.bounds;
  SCDisplay *display=associated.count?CUPreviewSelectDisplay(content.displays,target.bounds,target.bounds):nil;
  if(display){
    CGRect source=target.bounds;for(SCWindow *window in associated)source=CGRectUnion(source,window.frame);source=CGRectIntersection(source,display.frame);
    NSMutableArray *windows=[NSMutableArray arrayWithObject:selected];[windows addObjectsFromArray:associated];
    geometry.filter=[[SCContentFilter alloc]initWithDisplay:display includingWindows:windows];geometry.scale=geometry.filter.pointPixelScale;
    geometry.sourceBounds=source;geometry.includesAssociatedWindows=YES;geometry.configuration=CUPreviewConfiguration(source,geometry.scale);
    geometry.configuration.sourceRect=CGRectOffset(source,-CGRectGetMinX(display.frame),-CGRectGetMinY(display.frame));geometry.configuration.shouldBeOpaque=NO;
  }else{
    geometry.filter=[[SCContentFilter alloc]initWithDesktopIndependentWindow:selected];geometry.scale=CUPreviewWindowScale(target.bounds);geometry.configuration=CUPreviewConfiguration(target.bounds,geometry.scale);
  }
  return geometry;
}
static CUPreviewCaptureGeometry *CUPreviewCursorGeometry(SCShareableContent *content,CGRect targetBounds,NSDictionary *source){
  SCWindow *cursor=nil;
  for(SCWindow *window in content.windows)if(window.windowID==[source[@"cursorWindowID"]unsignedIntValue]&&window.owningApplication.processID==[source[@"ownerPID"]intValue]){cursor=window;break;}
  if(!cursor)return nil;
  SCDisplay *display=CUPreviewSelectDisplay(content.displays,targetBounds,cursor.frame);if(!display)return nil;
  CGRect viewport=CGRectIntersection(targetBounds,display.frame);if(CGRectIsNull(viewport)||CGRectGetWidth(viewport)<=0||CGRectGetHeight(viewport)<=0)return nil;
  CUPreviewCaptureGeometry *geometry=[CUPreviewCaptureGeometry new];geometry.filter=[[SCContentFilter alloc]initWithDisplay:display includingWindows:@[cursor]];
  geometry.scale=geometry.filter.pointPixelScale;geometry.sourceBounds=viewport;geometry.targetBounds=targetBounds;
  geometry.configuration=CUPreviewConfiguration(viewport,geometry.scale);geometry.configuration.shouldBeOpaque=NO;
  CGRect local=CGRectOffset(viewport,-CGRectGetMinX(display.frame),-CGRectGetMinY(display.frame));geometry.configuration.sourceRect=local;
  geometry.cursorCaptureKey=@[@(cursor.windowID),@(display.displayID),CUBounds(local),@(geometry.configuration.width),@(geometry.configuration.height)];return geometry;
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
@interface CUPreviewCursorOutput : NSObject <SCStreamOutput,SCStreamDelegate>
@property SCStream *stream;
@property BOOL startFinished;
@property BOOL stopFinished;
@property BOOL stopRequested;
@property NSMutableArray *stopCompletions;
@property(copy) void (^sampleHandler)(CMSampleBufferRef sample);
@property(copy) void (^errorHandler)(NSError *error);
@end
@implementation CUPreviewCursorOutput
- (instancetype)init{if((self=[super init]))_stopCompletions=[NSMutableArray new];return self;}
- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sample ofType:(SCStreamOutputType)type{if(stream==self.stream&&type==SCStreamOutputTypeScreen&&CMSampleBufferIsValid(sample)&&self.sampleHandler)self.sampleHandler(sample);}
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error{if(stream==self.stream&&self.errorHandler)self.errorHandler(error);}
@end

@interface CUPreview : NSObject <SCStreamOutput,SCStreamDelegate>
@property CUWindow *target;
@property NSString *captureId;
@property CUPreviewProducer *producer;
@property SCStream *stream;
@property NSCondition *condition;
@property dispatch_queue_t frames;
@property NSDictionary *latest;
@property NSError *failure;
@property CGRect wantedBounds;
@property CGRect configuredBounds;
@property double pointPixelScale;
@property SCStreamConfiguration *configuration;
@property SCContentFilter *filter;
@property CGRect sourceBounds;
@property NSArray<NSNumber *> *associatedWindowIDs;
@property BOOL associatedWindowIDsProvided;
@property BOOL associatedWindowIDDiscoveryAvailable;
@property BOOL associatedWindowIDDiscoveryParityAvailable;
@property NSUInteger windowContextGeneration;
@property BOOL includesAssociatedWindows;
@property BOOL captureGeometryDirty;
@property NSUInteger associatedWindowIDsGeneration;
@property NSUInteger sequence;
@property NSUInteger generation;
@property BOOL reconfiguring;
@property BOOL stopped;
@property BOOL stopFinished;
@property BOOL startFinished;
@property BOOL stopRequested;
@property BOOL paused;
@property BOOL jpegRequested;
@property NSString *cursorOwnerSessionLabel;
@property CUPreviewCursorOutput *cursorOutput;
@property BOOL cursorStopFinished;
@property NSString *cursorFailure;
- (void)updateBounds:(CGRect)bounds;
- (BOOL)stop;
- (void)requestStop;
- (void)replaceSourceSampleLocked:(CMSampleBufferRef)sample;
- (CMSampleBufferRef)copySourceSampleLocked CF_RETURNS_RETAINED;
- (void)updateCursorOwnerSessionLabel:(NSString *)label;
- (void)refreshCursorSource;
- (void)finishCursorTransition;
- (void)stopCursorCapture:(dispatch_block_t)completion;
- (void)finishCursorOutput:(CUPreviewCursorOutput *)output;
- (void)startCursorGeometry:(CUPreviewCaptureGeometry *)geometry source:(NSDictionary *)source;
- (void)reportCaptureFailure:(NSError *)failure;
@end
static CUPreview *CUPreviewForSession(CUSession *session){@synchronized(session){return session.preview;}}
static void CUInstallPreview(CUSession *session,CUPreview *preview){
  @synchronized(session){if(!session.preview){session.preview=preview;return;}}
  [preview.stream removeStreamOutput:preview type:SCStreamOutputTypeScreen error:NULL];preview.stream=nil;
  CUFail(@"PREVIEW_ACTIVE",@"This connection already has a window preview.");
}
static void CUReleasePreview(CUSession *session,CUPreview *preview){@synchronized(session){if(session.preview==preview)session.preview=nil;}}
@implementation CUPreview {
  CMSampleBufferRef _sourceSample;
  id _cursorObserver;
  NSDictionary *_cursorSource;
  NSArray *_cursorCaptureKey;
  NSUInteger _cursorGeneration;
  BOOL _cursorTransitionInFlight;
  BOOL _cursorRefreshPending;
  SCStream *_startingStream;
}
- (instancetype)init {if((self=[super init])){_captureId=NSUUID.UUID.UUIDString;_condition=[NSCondition new];_cursorStopFinished=YES;_jpegRequested=YES;_frames=dispatch_queue_create("ai.trisoul.computer-use.preview",DISPATCH_QUEUE_SERIAL);__weak CUPreview *weak=self;_cursorObserver=[NSNotificationCenter.defaultCenter addObserverForName:CUCursorCaptureSourceDidChangeNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification){(void)notification;[weak refreshCursorSource];}];}return self;}
- (void)replaceSourceSampleLocked:(CMSampleBufferRef)sample{if(sample)CFRetain(sample);if(_sourceSample)CFRelease(_sourceSample);_sourceSample=sample;}
- (CMSampleBufferRef)copySourceSampleLocked{return _sourceSample?(CMSampleBufferRef)CFRetain(_sourceSample):NULL;}
- (void)dealloc{if(_cursorObserver)[NSNotificationCenter.defaultCenter removeObserver:_cursorObserver];if(_sourceSample)CFRelease(_sourceSample);}
- (void)reportCaptureFailure:(NSError *)failure{
  __weak CUPreview *weak=self;CUPreviewProducer *producer=self.producer;
  dispatch_async(dispatch_get_main_queue(),^{CUPreview *owner=weak;if(!owner)return;[owner.condition lock];BOOL current=!owner.stopped&&owner.producer==producer&&owner.failure==failure;[owner.condition unlock];if(current&&producer.failureHandler)producer.failureHandler(failure);});
}
- (void)updateCursorOwnerSessionLabel:(NSString *)label{
  NSString *owned=[label copy];__weak CUPreview *weak=self;dispatch_async(dispatch_get_main_queue(),^{CUPreview *owner=weak;if(!owner)return;[owner.condition lock];BOOL changed=!((!owned&&!owner.cursorOwnerSessionLabel)||[owner.cursorOwnerSessionLabel isEqual:owned]);owner.cursorOwnerSessionLabel=owned;[owner.condition unlock];if(changed){[owner stopCursorCapture:^{}];[owner refreshCursorSource];}});
}
- (void)finishCursorTransition{
  _cursorTransitionInFlight=NO;BOOL refresh=_cursorRefreshPending;_cursorRefreshPending=NO;
  [self.condition lock];if(!self.cursorOutput)self.cursorStopFinished=YES;BOOL stopped=self.stopped;[self.condition broadcast];[self.condition unlock];
  if(refresh&&!stopped)[self refreshCursorSource];
}
- (void)refreshCursorSource{
  if(!NSThread.isMainThread){__weak CUPreview *weak=self;dispatch_async(dispatch_get_main_queue(),^{[weak refreshCursorSource];});return;}
  [self.condition lock];BOOL stopped=self.stopped||self.failure!=nil;NSString *label=self.cursorOwnerSessionLabel;CUPreviewProducer *producer=self.producer;CGRect targetBounds=self.sourceBounds;[self.condition unlock];
  if(_cursorTransitionInFlight){_cursorRefreshPending=YES;if(stopped)[self stopCursorCapture:^{}];return;}
  _cursorTransitionInFlight=YES;
  NSDictionary *source=(!stopped&&producer&&label.length)?CUCursorCaptureSource(self.target.pid,self.target.windowId,label):nil;
  if(!source||![source[@"cursorStyleParityAvailable"]boolValue]||![source[@"visible"]boolValue]||!CUCursorCaptureSourceIsCurrent(source)){
    [self stopCursorCapture:^{[self finishCursorTransition];}];return;
  }
  __weak CUPreview *weak=self;
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO completionHandler:^(SCShareableContent *content,NSError *error){
    dispatch_async(dispatch_get_main_queue(),^{
      CUPreview *owner=weak;if(!owner)return;
      [owner.condition lock];BOOL current=!owner.stopped&&owner.producer==producer&&[owner.cursorOwnerSessionLabel isEqual:label]&&CGRectEqualToRect(owner.sourceBounds,targetBounds);[owner.condition unlock];
      if(!current||!CUCursorCaptureSourceIsCurrent(source)){owner->_cursorRefreshPending=YES;[owner stopCursorCapture:^{[owner finishCursorTransition];}];return;}
      CUPreviewCaptureGeometry *geometry=error?nil:CUPreviewCursorGeometry(content,targetBounds,source);
      if(!geometry){owner.cursorFailure=error.localizedDescription;[owner stopCursorCapture:^{[owner finishCursorTransition];}];return;}
      if(owner.cursorOutput&&[owner->_cursorCaptureKey isEqual:geometry.cursorCaptureKey]&&owner->_cursorSource[@"opaqueToken"]==source[@"opaqueToken"]&&[owner->_cursorSource[@"lifecycleGeneration"]isEqual:source[@"lifecycleGeneration"]]&&CUCursorCaptureSourceIsCurrent(owner->_cursorSource)){
        [producer setCursorTargetBounds:geometry.targetBounds cursorBounds:geometry.sourceBounds sourceGeneration:owner->_cursorGeneration error:NULL];[owner finishCursorTransition];return;
      }
      [owner stopCursorCapture:^{[owner.condition lock];BOOL stillCurrent=!owner.stopped&&owner.producer==producer&&[owner.cursorOwnerSessionLabel isEqual:label]&&CGRectEqualToRect(owner.sourceBounds,targetBounds);[owner.condition unlock];if(stillCurrent&&CUCursorCaptureSourceIsCurrent(source))[owner startCursorGeometry:geometry source:source];else{owner->_cursorRefreshPending=YES;[owner finishCursorTransition];}}];
    });
  }];
}
- (void)finishCursorOutput:(CUPreviewCursorOutput *)output{
  if(output.stopFinished)return;output.stopFinished=YES;
  [output.stream removeStreamOutput:output type:SCStreamOutputTypeScreen error:NULL];output.stream=nil;
  if(self.cursorOutput==output){self.cursorOutput=nil;_cursorSource=nil;_cursorCaptureKey=nil;[self.producer clearCursorSource];[self.condition lock];self.cursorStopFinished=YES;[self.condition broadcast];[self.condition unlock];}
  NSArray *completions=[output.stopCompletions copy];[output.stopCompletions removeAllObjects];for(dispatch_block_t completion in completions)completion();
}
- (void)stopCursorCapture:(dispatch_block_t)completion{
  CUPreviewCursorOutput *output=self.cursorOutput;
  if(!output){_cursorSource=nil;_cursorCaptureKey=nil;[self.producer clearCursorSource];[self.condition lock];self.cursorStopFinished=YES;[self.condition broadcast];[self.condition unlock];completion();return;}
  [output.stopCompletions addObject:[completion copy]];
  if(!output.stopRequested){_cursorGeneration++;_cursorSource=nil;_cursorCaptureKey=nil;[self.producer clearCursorSource];}
  if(!output.startFinished||output.stopRequested)return;output.stopRequested=YES;
  __weak CUPreview *weak=self;
  [output.stream stopCaptureWithCompletionHandler:^(NSError *error){dispatch_async(dispatch_get_main_queue(),^{CUPreview *owner=weak;if(!owner)return;if(error){output.stopRequested=NO;owner.cursorFailure=error.localizedDescription;[owner.condition lock];[owner.condition broadcast];[owner.condition unlock];}else [owner finishCursorOutput:output];});}];
}
- (void)startCursorGeometry:(CUPreviewCaptureGeometry *)geometry source:(NSDictionary *)source{
  NSError *error;NSUInteger generation=++_cursorGeneration;
  if(![self.producer setCursorSourceGeneration:generation error:&error]||![self.producer setCursorTargetBounds:geometry.targetBounds cursorBounds:geometry.sourceBounds sourceGeneration:generation error:&error]){self.cursorFailure=error.localizedDescription;[self finishCursorTransition];return;}
  CUPreviewCursorOutput *output=[CUPreviewCursorOutput new];__weak CUPreviewCursorOutput *weakOutput=output;__weak CUPreview *weak=self;
  output.sampleHandler=^(CMSampleBufferRef sample){CFRetain(sample);dispatch_async(dispatch_get_main_queue(),^{CUPreview *owner=weak;CUPreviewCursorOutput *capturer=weakOutput;if(owner&&capturer&&owner.cursorOutput==capturer&&owner->_cursorGeneration==generation&&[owner.cursorOwnerSessionLabel isEqual:source[@"ownerSessionLabel"]]&&CUCursorCaptureSourceIsCurrent(source))[owner.producer receiveCursorSampleBuffer:sample sourceGeneration:generation];CFRelease(sample);});};
  output.errorHandler=^(NSError *failure){dispatch_async(dispatch_get_main_queue(),^{CUPreview *owner=weak;CUPreviewCursorOutput *capturer=weakOutput;if(owner&&capturer&&owner.cursorOutput==capturer&&(owner->_cursorGeneration==generation||capturer.stopRequested||capturer.stopCompletions.count)){owner.cursorFailure=failure.localizedDescription;owner->_cursorGeneration++;[owner finishCursorOutput:capturer];[owner finishCursorTransition];}});};
  output.stream=[[SCStream alloc]initWithFilter:geometry.filter configuration:geometry.configuration delegate:output];
  if(![output.stream addStreamOutput:output type:SCStreamOutputTypeScreen sampleHandlerQueue:self.frames error:&error]){self.cursorFailure=error.localizedDescription;[self.producer clearCursorSource];output.stream=nil;[self finishCursorTransition];return;}
  self.cursorOutput=output;_cursorSource=source;_cursorCaptureKey=geometry.cursorCaptureKey;self.cursorFailure=nil;[self.condition lock];self.cursorStopFinished=NO;[self.condition unlock];
  [output.stream startCaptureWithCompletionHandler:^(NSError *failure){dispatch_async(dispatch_get_main_queue(),^{
    CUPreview *owner=weak;if(!owner||owner.cursorOutput!=output)return;output.startFinished=YES;
    if(failure){owner.cursorFailure=failure.localizedDescription;[owner finishCursorOutput:output];[owner finishCursorTransition];return;}
    if(owner.stopped||owner->_cursorGeneration!=generation||![owner.cursorOwnerSessionLabel isEqual:source[@"ownerSessionLabel"]]||!CUCursorCaptureSourceIsCurrent(source)||output.stopCompletions.count){[owner stopCursorCapture:^{[owner finishCursorTransition];}];return;}
    [owner finishCursorTransition];
  });}];
}
- (void)updateBounds:(CGRect)bounds {
  [self.condition lock];self.wantedBounds=bounds;
  if(self.stopped||self.reconfiguring||(!self.captureGeometryDirty&&CGRectEqualToRect(bounds,self.configuredBounds))){[self.condition unlock];return;}
  NSArray *associatedIDs=[self.associatedWindowIDs copy];NSUInteger associatedGeneration=self.associatedWindowIDsGeneration;
  self.reconfiguring=YES;self.latest=nil;[self replaceSourceSampleLocked:NULL];self.generation++;NSUInteger generation=self.generation;[self.producer setSourceFrameGeneration:generation];[self.condition unlock];
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO completionHandler:^(SCShareableContent *content,NSError *error){
    CUWindow *target=[CUWindow new];target.pid=self.target.pid;target.windowId=self.target.windowId;target.bounds=bounds;
    CUPreviewCaptureGeometry *geometry=error?nil:CUPreviewGeometry(content,target,associatedIDs);
    if(!geometry&&!error)error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:@"The selected capture window is no longer available."}];
    void (^finished)(NSError *)=^(NSError *failure){
      [self.condition lock];self.reconfiguring=NO;BOOL stopped=self.stopped;if(!stopped){if(failure)self.failure=failure;else{self.configuredBounds=bounds;self.sourceBounds=geometry.sourceBounds;self.configuration=geometry.configuration;self.filter=geometry.filter;self.pointPixelScale=geometry.scale;self.includesAssociatedWindows=geometry.includesAssociatedWindows;self.captureGeometryDirty=self.associatedWindowIDsGeneration!=associatedGeneration;}}CGRect latest=self.wantedBounds;[self.condition broadcast];[self.condition unlock];
      if(failure&&!stopped){[self.producer stopVideoDelivery];[self reportCaptureFailure:failure];[self refreshCursorSource];}
      if(!failure&&!stopped){[self refreshCursorSource];[self updateBounds:latest];}
    };
    [self.condition lock];BOOL stopped=self.stopped;[self.condition unlock];
    if(error||stopped){finished(error);return;}
    [self.condition lock];SCStream *previous=self.stream;self.stopRequested=YES;[self.condition unlock];
    [previous stopCaptureWithCompletionHandler:^(NSError *stopError){
      [self.condition lock];self.stopRequested=NO;BOOL stopped=self.stopped,ended=self.stopFinished||stopError==nil;if(ended)self.stopFinished=YES;[self.condition broadcast];[self.condition unlock];
      if(!ended){finished(stopError);return;}
      [previous removeStreamOutput:self type:SCStreamOutputTypeScreen error:NULL];
      if(stopped){[self.condition lock];if(self.stream==previous)self.stream=nil;[self.condition unlock];finished(nil);return;}
      SCStream *replacement=[[SCStream alloc]initWithFilter:geometry.filter configuration:geometry.configuration delegate:self];NSError *outputError;
      if(![replacement addStreamOutput:self type:SCStreamOutputTypeScreen sampleHandlerQueue:self.frames error:&outputError]){finished(outputError?:[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:@"The replacement capture output could not be attached."}]);return;}
      [self.condition lock];BOOL current=!self.stopped&&generation==self.generation;
      if(current){self.stream=replacement;_startingStream=replacement;self.startFinished=NO;self.stopFinished=NO;self.configuration=geometry.configuration;self.sourceBounds=geometry.sourceBounds;}[self.condition unlock];
      if(!current){[replacement removeStreamOutput:self type:SCStreamOutputTypeScreen error:NULL];finished(nil);return;}
      [replacement startCaptureWithCompletionHandler:^(NSError *startError){
        [self.condition lock];self.startFinished=YES;if(startError)self.stopFinished=YES;if(_startingStream==replacement)_startingStream=nil;BOOL shouldStop=self.stopped;[self.condition broadcast];[self.condition unlock];
        finished(startError);if(shouldStop){[self requestStop];return;}
        dispatch_async(self.frames,^{[self.condition lock];BOOL replay=!startError&&!self.stopped&&!self.reconfiguring&&generation==self.generation;CMSampleBufferRef sample=replay?[self copySourceSampleLocked]:NULL;[self.condition unlock];if(sample){[self stream:replacement didOutputSampleBuffer:sample ofType:SCStreamOutputTypeScreen];CFRelease(sample);}});
      }];
    }];
  }];
}
- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sample ofType:(SCStreamOutputType)type {
  if(type!=SCStreamOutputTypeScreen||!CMSampleBufferIsValid(sample))return;
  [self.condition lock];
  if(self.stopped||self.failure||stream!=self.stream){[self.condition unlock];return;}
  if(self.reconfiguring){if(stream==_startingStream)[self replaceSourceSampleLocked:sample];[self.condition unlock];return;}
  NSUInteger generation=self.generation;
  CVPixelBufferRef buffer=CMSampleBufferGetImageBuffer(sample);
  CUPreviewProducer *producer=self.producer;
  [self replaceSourceSampleLocked:sample];
  [self.condition unlock];
  if(producer)[producer receiveSampleBuffer:sample sourceGeneration:generation];
  NSArray *attachments=(__bridge NSArray *)CMSampleBufferGetSampleAttachmentsArray(sample,NO);NSDictionary *info=attachments.firstObject;
  SCFrameStatus status=[info[SCStreamFrameInfoStatus]integerValue];
  [self.condition lock];
  if(self.stopped||self.reconfiguring){[self.condition unlock];return;}
  BOOL idle=status==SCFrameStatusIdle;
  if(idle&&!self.producer){[self.condition broadcast];[self.condition unlock];return;}
  if(!idle&&status!=SCFrameStatusComplete&&status!=SCFrameStatusStarted){self.paused=YES;self.latest=nil;[self.condition broadcast];[self.condition unlock];return;}
  if(generation!=self.generation){[self.condition unlock];return;}
  CGRect configured=self.sourceBounds,wanted=self.sourceBounds;SCStreamConfiguration *config=self.configuration;BOOL associated=self.includesAssociatedWindows;[self.condition unlock];
  if(!buffer)return;
  CGRect bounds=wanted;id screen=info[SCStreamFrameInfoScreenRect];BOOL verified=NO;CGRect reported;
  if([screen isKindOfClass:NSDictionary.class])verified=CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)screen,&reported);
  else if([screen isKindOfClass:NSValue.class]&&strcmp([screen objCType],@encode(CGRect))==0){[screen getValue:&reported size:sizeof(reported)];verified=YES;}
  if(verified&&isfinite(reported.origin.x)&&isfinite(reported.origin.y)&&isfinite(reported.size.width)&&isfinite(reported.size.height)&&reported.size.width>0&&reported.size.height>0)bounds=reported;else verified=NO;
  if(associated){bounds=configured;verified=YES;}
  if(!verified)return;
  // A resized source can arrive in the preceding output configuration. Never
  // label its scaled/letterboxed pixels as a stable frame of the new geometry.
  if(fabs(bounds.size.width-configured.size.width)>1||fabs(bounds.size.height-configured.size.height)>1){
    [self.condition lock];BOOL nativeCurrent=self.producer&&!self.stopped&&!self.reconfiguring&&generation==self.generation;[self.condition unlock];
    if(nativeCurrent&&!associated)[self updateBounds:bounds];return;
  }
  if(CVPixelBufferGetWidth(buffer)!=config.width||CVPixelBufferGetHeight(buffer)!=config.height)return;
  if(idle){[self.condition lock];[self.condition broadcast];[self.condition unlock];return;}
  [self.condition lock];BOOL encodeJPEG=self.jpegRequested&&!self.stopped&&!self.reconfiguring&&generation==self.generation;if(encodeJPEG)self.jpegRequested=NO;[self.condition unlock];if(!encodeJPEG)return;
  NSData *jpeg=CUPreviewJPEG(buffer);if(!jpeg){[self.condition lock];if(!self.stopped)self.jpegRequested=YES;[self.condition unlock];return;}
  [self.condition lock];
  if(!self.stopped&&!self.reconfiguring&&generation==self.generation){
    self.paused=NO;self.sequence++;
    self.latest=@{@"sequence":@(self.sequence),@"data":[jpeg base64EncodedStringWithOptions:0],@"mediaType":@"image/jpeg",@"pixelWidth":@(CVPixelBufferGetWidth(buffer)),@"pixelHeight":@(CVPixelBufferGetHeight(buffer)),@"bounds":CUBounds(bounds),@"geometryVerified":@(verified),@"capturedAt":@([[NSDate date]timeIntervalSince1970]*1000)};
    [self.condition broadcast];
  }[self.condition unlock];
}
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
  [self.condition lock];if(stream!=self.stream){[self.condition unlock];return;}if(self.reconfiguring&&stream!=_startingStream){self.stopFinished=YES;[self.condition broadcast];[self.condition unlock];return;}
  if(!self.stopped)self.failure=error;self.latest=nil;[self replaceSourceSampleLocked:NULL];self.stopFinished=YES;CUPreviewProducer *producer=self.producer;[self.condition broadcast];[self.condition unlock];
  [producer stopVideoDelivery];
  [self reportCaptureFailure:error];[self refreshCursorSource];
}
- (void)requestStop {
  [self.condition lock];BOOL request=self.startFinished&&!self.stopFinished&&!self.stopRequested;if(request)self.stopRequested=YES;[self.condition unlock];
  if(request)[self.stream stopCaptureWithCompletionHandler:^(NSError *error){[self.condition lock];self.stopRequested=NO;self.stopFinished=self.stopFinished||error==nil;[self.condition broadcast];[self.condition unlock];}];
}
- (BOOL)stop {
  [self.condition lock];self.stopped=YES;self.latest=nil;[self replaceSourceSampleLocked:NULL];CUPreviewProducer *producer=self.producer;[self.condition broadcast];[self.condition unlock];
  [producer stopVideoDelivery];[self requestStop];__weak CUPreview *weak=self;dispatch_async(dispatch_get_main_queue(),^{[weak stopCursorCapture:^{}];});
  NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:2];[self.condition lock];
  while((!self.stopFinished||!self.cursorStopFinished)&&[deadline timeIntervalSinceNow]>0)[self.condition waitUntilDate:deadline];BOOL finished=self.stopFinished&&self.cursorStopFinished;[self.condition unlock];
  if(finished){SCStream *stream=self.stream;[stream removeStreamOutput:self type:SCStreamOutputTypeScreen error:nil];self.stream=nil;}return finished;
}
@end

NSDictionary *CUStartPreview(CUSession *session,NSDictionary *args){
  if(CUPreviewForSession(session))CUFail(@"PREVIEW_ACTIVE",@"This connection already has a window preview.");
  if(!CGPreflightScreenCaptureAccess())CUFail(@"SCREEN_RECORDING_PERMISSION",@"Enable Screen Recording for Oh My DSH Computer Use.");
  CUWindow *target=CUResolveWindow(session,args);
  if(![args[@"process_identity"]isEqual:target.processIdentity])CUFail(@"STALE_PROCESS",@"Re-select the application before opening its live view.");
  id associatedIDs=args[@"associated_window_ids"]?:args[@"associatedWindowIDs"];
  if(associatedIDs&&!CUPreviewAssociatedIDsValid(associatedIDs))CUFail(@"CAPTURE_GEOMETRY",@"Associated window identities must be an explicit array of positive window IDs.");
  BOOL associatedIDsProvided=associatedIDs!=nil;__block NSDictionary *windowContext;__block NSArray *discoveredIDs;
  dispatch_block_t discover=^{windowContext=CUPreviewWindowContext(session,target);if(windowContext)discoveredIDs=CUPreviewAssociatedWindowIDs(windowContext,target);};
  if(NSThread.isMainThread)discover();else dispatch_sync(dispatch_get_main_queue(),discover);
  if(discoveredIDs)associatedIDs=discoveredIDs;
  __block SCShareableContent *content;__block NSError *failure;dispatch_semaphore_t ready=dispatch_semaphore_create(0);
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO completionHandler:^(SCShareableContent *value,NSError *error){content=value;failure=error;dispatch_semaphore_signal(ready);}];
  if(dispatch_semaphore_wait(ready,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC)))CUFail(@"CAPTURE_TIMEOUT",@"Window capture did not become ready.");[session check];
  if(failure)CUPreviewFailure(failure);
  CUPreviewCaptureGeometry *geometry=CUPreviewGeometry(content,target,associatedIDs?:@[]);
  if(!geometry)CUFail(@"STALE_WINDOW",@"The selected application window is no longer available.");
  CUPreview *preview=[CUPreview new];preview.target=target;preview.wantedBounds=target.bounds;preview.configuredBounds=target.bounds;preview.sourceBounds=geometry.sourceBounds;preview.pointPixelScale=geometry.scale;preview.configuration=geometry.configuration;preview.filter=geometry.filter;preview.associatedWindowIDs=[associatedIDs copy]?:@[];preview.associatedWindowIDsProvided=associatedIDsProvided;preview.associatedWindowIDDiscoveryAvailable=discoveredIDs!=nil;preview.associatedWindowIDDiscoveryParityAvailable=discoveredIDs!=nil&&[windowContext[@"sourceWindowCacheParityAvailable"]boolValue];preview.windowContextGeneration=[windowContext[@"windowContextGeneration"]unsignedIntegerValue];preview.includesAssociatedWindows=geometry.includesAssociatedWindows;
  preview.stream=[[SCStream alloc]initWithFilter:geometry.filter configuration:geometry.configuration delegate:preview];
  NSError *outputError;if(![preview.stream addStreamOutput:preview type:SCStreamOutputTypeScreen sampleHandlerQueue:preview.frames error:&outputError])CUFail(@"CAPTURE_UNAVAILABLE",outputError.localizedDescription?:@"Could not attach the window video output.");
  CUInstallPreview(session,preview);
  [preview.stream startCaptureWithCompletionHandler:^(NSError *error){
    [preview.condition lock];failure=error;preview.startFinished=YES;if(error){preview.failure=error;preview.stopFinished=YES;}BOOL stopped=preview.stopped;[preview.condition broadcast];[preview.condition unlock];
    if(stopped)[preview requestStop];dispatch_semaphore_signal(ready);
  }];
  if(dispatch_semaphore_wait(ready,dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC)))CUFail(@"CAPTURE_TIMEOUT",@"Window video capture did not start in time.");
  if(failure)CUPreviewFailure(failure);[session check];
  return CUResult(@{@"backend":@"screencapturekit",@"pid":@(target.pid),@"window_id":@(target.windowId),@"process_identity":target.processIdentity,@"captureId":preview.captureId,@"pixelBufferProducerSourceAvailable":@YES,@"captureConfigurationParityAvailable":@YES,@"configuredFrameRate":@60,@"associatedWindowIDsProvided":@(preview.associatedWindowIDsProvided),@"associatedWindowIDDiscoveryAvailable":@(preview.associatedWindowIDDiscoveryAvailable),@"associatedWindowIDDiscoveryParityAvailable":@(preview.associatedWindowIDDiscoveryParityAvailable),@"associatedWindowCaptureAvailable":@YES,@"includesAssociatedWindows":@(preview.includesAssociatedWindows),@"sourceBounds":CUBounds(geometry.sourceBounds),@"pointPixelScale":@(geometry.scale)});
}
NSDictionary *CUReadPreview(CUSession *session,NSDictionary *args){
  CUPreview *preview=CUPreviewForSession(session);if(!preview)CUFail(@"PREVIEW_CLOSED",@"The application preview is not connected.");
  if(args[@"capture_id"]&&![args[@"capture_id"]isEqual:preview.captureId])CUFail(@"PREVIEW_CLOSED",@"The requested capture is no longer connected.");
  CUWindow *target=preview.target;
  if(![CUIdentity(target.pid)isEqual:target.processIdentity])CUFail(@"STALE_PROCESS",@"The selected application restarted.");
  CGRect actualBounds;BOOL found=CUPreviewReadWindowBounds(target,&actualBounds);if(found)target.bounds=actualBounds;
  if(!found)CUFail(@"STALE_WINDOW",@"The selected application window closed.");CURefreshPreviewAssociatedWindows(session,NULL);[preview updateBounds:target.bounds];
  NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:.1];NSUInteger after=[args[@"after"]unsignedIntegerValue];
  NSMutableDictionary *frame;
  CUPreviewProducer *producer;
  [preview.condition lock];
  @try{
    if(!preview.latest||preview.sequence<=after)preview.jpegRequested=YES;
    while(!preview.failure&&!preview.stopped&&(!preview.latest||preview.sequence<=after)&&[deadline timeIntervalSinceNow]>0){[session check];[preview.condition waitUntilDate:deadline];}
    [session check];
    if(preview.failure)CUPreviewFailure(preview.failure);
    if(preview.stopped)CUFail(@"PREVIEW_CLOSED",@"The application preview was closed.");
    frame=[@{@"status":preview.paused?@"paused":preview.latest?@"live":@"waiting",@"sequence":@(preview.sequence),@"captureId":preview.captureId,@"pid":@(target.pid),@"window_id":@(target.windowId),@"process_identity":target.processIdentity,@"backend":@"screencapturekit",@"sourceBounds":CUBounds(preview.sourceBounds),@"pointPixelScale":@(preview.pointPixelScale),@"captureConfigurationParityAvailable":@YES,@"configuredFrameRate":@60,@"associatedWindowCaptureAvailable":@YES,@"associatedWindowIDsProvided":@(preview.associatedWindowIDsProvided),@"includesAssociatedWindows":@(preview.includesAssociatedWindows)}mutableCopy];
    if(preview.latest&&preview.sequence>after)[frame addEntriesFromDictionary:preview.latest];
    frame[@"associatedWindowIDDiscoveryAvailable"]=@(preview.associatedWindowIDDiscoveryAvailable);frame[@"associatedWindowIDDiscoveryParityAvailable"]=@(preview.associatedWindowIDDiscoveryParityAvailable);frame[@"windowContextGeneration"]=@(preview.windowContextGeneration);
    producer=preview.producer;
  }@finally{[preview.condition unlock];}
  frame[@"pixelBufferProducerSourceAvailable"]=@YES;
  if(producer)frame[@"nativeProducer"]=[producer snapshot];
  NSString *ownerSessionLabel=[args[@"owner_session_label"]isKindOfClass:NSString.class]?args[@"owner_session_label"]:nil;
  [preview updateCursorOwnerSessionLabel:ownerSessionLabel];
  frame[@"cursor"]=CUCursorSnapshot(target.pid,target.windowId,ownerSessionLabel)?:NSNull.null;
  return @{@"structuredContent":frame,@"content":@[]};
}
BOOL CUStopPreview(CUSession *session){CUPreview *preview=CUPreviewForSession(session);if(!preview)return YES;BOOL stopped=[preview stop];[preview.condition lock];BOOL released=stopped&&!preview.producer;[preview.condition unlock];if(released)CUReleasePreview(session,preview);return stopped;}

NSDictionary *CUPreviewSourceIdentity(CUSession *session,NSError **error){
  CUPreview *preview=CUPreviewForSession(session);
  if(!preview){if(error)*error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:@"This connection does not own a live preview source."}];return nil;}
  [preview.condition lock];
  NSDictionary *identity=@{@"captureId":preview.captureId,@"pid":@(preview.target.pid),@"windowId":@(preview.target.windowId),@"processIdentity":preview.target.processIdentity,@"sourceFrameGeneration":@(preview.generation),@"pixelBufferProducerSourceAvailable":@YES,@"captureConfigurationParityAvailable":@YES,@"associatedWindowCaptureAvailable":@YES,@"associatedWindowIDsProvided":@(preview.associatedWindowIDsProvided),@"associatedWindowIDDiscoveryAvailable":@(preview.associatedWindowIDDiscoveryAvailable),@"associatedWindowIDDiscoveryParityAvailable":@(preview.associatedWindowIDDiscoveryParityAvailable),@"windowContextGeneration":@(preview.windowContextGeneration),@"includesAssociatedWindows":@(preview.includesAssociatedWindows),@"sourceBounds":CUBounds(preview.sourceBounds),@"pointPixelScale":@(preview.pointPixelScale),@"cursorCaptureSourceAvailable":@(preview.cursorOutput!=nil),@"cursorStopFinished":@(preview.cursorStopFinished),@"cursorCaptureFailure":preview.cursorFailure?:NSNull.null,@"configuredFrameRate":@60,@"stopped":@(preview.stopped),@"startFinished":@(preview.startFinished),@"stopFinished":@(preview.stopFinished&&preview.cursorStopFinished),@"reconfiguring":@(preview.reconfiguring||preview.captureGeometryDirty),@"sourceFailed":@(preview.failure!=nil)};
  [preview.condition unlock];return identity;
}

BOOL CUBindPreviewProducer(CUSession *session,CUPreviewProducer *producer,NSError **error){
  CUPreview *preview=CUPreviewForSession(session);
  NSString *message=nil;
  if(!preview)message=@"This preview does not expose a ScreenCaptureKit pixel-buffer source.";
  else if(![[producer snapshot][@"nativeContextAvailable"]boolValue])message=@"The producer's remote layer context is no longer available.";
  else if(![producer.identity[@"captureId"]isEqual:preview.captureId]||[producer.identity[@"pid"]intValue]!=preview.target.pid||[producer.identity[@"windowId"]unsignedIntValue]!=preview.target.windowId||![producer.identity[@"processIdentity"]isEqual:preview.target.processIdentity]||![CUIdentity(preview.target.pid)isEqual:preview.target.processIdentity])message=@"The producer does not own this capture, process and selected window.";
  if(message){if(error)*error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:message}];return NO;}
  [preview.condition lock];
  BOOL bound=!preview.stopped&&!preview.failure&&(!preview.producer||preview.producer==producer);
  CMSampleBufferRef sample=NULL;
  NSUInteger generation=preview.generation;
  CGSize initialSize=preview.reconfiguring?CGSizeZero:preview.sourceBounds.size;
  if(bound){preview.producer=producer;[producer setSourceFrameGeneration:generation];if(!preview.reconfiguring)sample=[preview copySourceSampleLocked];}
  [preview.condition unlock];
  if(!bound&&error)*error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:@"The preview is stopped or already belongs to a different native producer."}];
  if(bound&&initialSize.width>0&&initialSize.height>0)[producer prepareInitialSourceSize:initialSize error:NULL];
  if(sample){[producer receiveSampleBuffer:sample sourceGeneration:generation];CFRelease(sample);}
  if(bound){CURefreshPreviewAssociatedWindows(session,NULL);[preview refreshCursorSource];}
  return bound;
}
void CUUnbindPreviewProducer(CUSession *session,CUPreviewProducer *producer){
  CUPreview *preview=CUPreviewForSession(session);if(!preview)return;
  [preview.condition lock];BOOL removed=preview.producer==producer;if(removed)preview.producer=nil;BOOL released=removed&&preview.stopped&&preview.stopFinished&&preview.cursorStopFinished;[preview.condition unlock];
  if(removed)[producer stopVideoDelivery];
  if(released)CUReleasePreview(session,preview);
}
void CUUpdatePreviewCursorOwnerSessionLabel(CUSession *session,NSString *label){CUPreview *preview=CUPreviewForSession(session);if(preview)[preview updateCursorOwnerSessionLabel:label];}
BOOL CURefreshPreviewAssociatedWindows(CUSession *session,NSError **error){
  CUPreview *preview=CUPreviewForSession(session);if(!preview){if(error)*error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:@"The selected capture is no longer connected."}];return NO;}
  __block BOOL accepted=NO,changed=NO;__block CGRect bounds;__block NSString *failure;
  dispatch_block_t refresh=^{
    NSDictionary *context=CUPreviewWindowContext(session,preview.target);NSArray *ids=context?CUPreviewAssociatedWindowIDs(context,preview.target):nil;
    BOOL hasBounds=ids&&CUPreviewReadWindowBounds(preview.target,&bounds);if(!hasBounds)ids=nil;
    [preview.condition lock];
    if(!preview.stopped&&!preview.failure&&ids){accepted=YES;preview.target.bounds=bounds;changed=![preview.associatedWindowIDs isEqualToArray:ids];preview.associatedWindowIDDiscoveryAvailable=YES;preview.associatedWindowIDDiscoveryParityAvailable=[context[@"sourceWindowCacheParityAvailable"]boolValue];preview.windowContextGeneration=[context[@"windowContextGeneration"]unsignedIntegerValue];if(changed){preview.associatedWindowIDs=[ids copy];preview.associatedWindowIDsGeneration++;preview.captureGeometryDirty=YES;}}
    else{preview.associatedWindowIDDiscoveryAvailable=NO;preview.associatedWindowIDDiscoveryParityAvailable=NO;failure=preview.stopped||preview.failure?@"The capture source is stopped or failed.":@"A real current window ownership snapshot is not available.";}
    [preview.condition unlock];
  };
  if(NSThread.isMainThread)refresh();else dispatch_sync(dispatch_get_main_queue(),refresh);
  if(!accepted){if(error)*error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:failure}];return NO;}
  [preview updateBounds:bounds];return YES;
}
BOOL CUUpdatePreviewAssociatedWindowIDs(CUSession *session,NSArray<NSNumber *> *windowIDs,NSError **error){
  CUPreview *preview=CUPreviewForSession(session);NSString *failure=nil;
  if(!CUPreviewAssociatedIDsValid(windowIDs))failure=@"Associated windows require an explicit array of positive window IDs.";
  else if(!preview)failure=@"The selected capture is no longer connected.";
  if(failure){if(error)*error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:failure}];return NO;}
  [preview.condition lock];BOOL accepted=!preview.stopped&&!preview.failure;CGRect bounds=preview.wantedBounds;
  BOOL changed=accepted&&![preview.associatedWindowIDs isEqualToArray:windowIDs];
  if(accepted){preview.associatedWindowIDsProvided=YES;if(changed){preview.associatedWindowIDs=[windowIDs copy];preview.associatedWindowIDsGeneration++;preview.captureGeometryDirty=YES;preview.associatedWindowIDDiscoveryAvailable=NO;preview.associatedWindowIDDiscoveryParityAvailable=NO;}}[preview.condition unlock];
  if(!accepted){if(error)*error=[NSError errorWithDomain:CUPreviewProducerErrorDomain code:9 userInfo:@{NSLocalizedDescriptionKey:@"The capture source is stopped or failed."}];return NO;}
  if(changed)[preview updateBounds:bounds];return YES;
}
