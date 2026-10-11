#import "PreviewProducer.h"
#import <VideoToolbox/VideoToolbox.h>
#import <AVFoundation/AVFoundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <objc/message.h>
#import <dlfcn.h>
#import <math.h>
#import <time.h>

NSString *const CUPreviewProducerErrorDomain=@"ai.trisoul.computer-use.preview-producer";

static NSError *CUProducerError(NSInteger code,NSString *message){
  return [NSError errorWithDomain:CUPreviewProducerErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey:message}];
}
static BOOL CUProducerFail(NSError **error,NSInteger code,NSString *message){if(error)*error=CUProducerError(code,message);return NO;}
CGSize CUPreviewPresentationSize(CGSize sourceSize,double maximumDisplaySize){
  if(!isfinite(sourceSize.width)||!isfinite(sourceSize.height)||sourceSize.width<=0||sourceSize.height<=0)return CGSizeMake(200,200);
  double maximum=isfinite(maximumDisplaySize)?MAX(100.,MIN(400.,round(maximumDisplaySize))):200.;
  double scale=MIN(maximum/sourceSize.width,maximum/sourceSize.height);
  return CGSizeMake(MAX(1.,sourceSize.width*scale),MAX(1.,sourceSize.height*scale));
}

@interface CUPreviewFence ()
@property(weak) CUPreviewProducer *owner;
@property uint32_t contextID;
@property NSUInteger requestToken;
- (instancetype)initWithPort:(mach_port_t)port owner:(CUPreviewProducer *)owner requestToken:(NSUInteger)requestToken;
@end
@implementation CUPreviewFence
- (instancetype)initWithPort:(mach_port_t)port owner:(CUPreviewProducer *)owner requestToken:(NSUInteger)requestToken{if((self=[super init])){_port=port;_owner=owner;_contextID=owner.contextID;_requestToken=requestToken;}return self;}
- (void)dealloc{if(_port!=MACH_PORT_NULL)mach_port_deallocate(mach_task_self(),_port);}
@end

@interface CUPreviewCompressionContext : NSObject
@property(weak) CUPreviewProducer *owner;
@property NSUInteger generation;
@end
@implementation CUPreviewCompressionContext
@end

@interface CUPreviewProducer ()
- (instancetype)initWithIdentity:(NSDictionary *)identity maximumPixelDimension:(double)maximumPixelDimension maximumDisplaySize:(double)maximumDisplaySize renderer:(CUPreviewPixelRenderer _Nullable)renderer nativeSampleRendering:(BOOL)nativeSampleRendering frameHandler:(CUPreviewEncodedFrameHandler)frameHandler error:(NSError **)error;
- (void)receiveFrameBuffer:(CVPixelBufferRef)buffer sample:(CMSampleBufferRef _Nullable)sample sourceGeneration:(NSUInteger)generation;
- (BOOL)isSourceFrameGenerationCurrent:(NSUInteger)generation;
- (void)requestPresentationSize:(CGSize)size;
- (void)applyCursorGeometry;
- (void)receiveEncodedSample:(CMSampleBufferRef)sample status:(OSStatus)status flags:(VTEncodeInfoFlags)flags context:(CUPreviewCompressionContext *)context;
@end

static void CUPreviewCompressionOutput(void *refcon,void *sourceRefcon,OSStatus status,VTEncodeInfoFlags flags,CMSampleBufferRef sample){
  (void)sourceRefcon;
  @autoreleasepool{
    CUPreviewCompressionContext *context=(__bridge CUPreviewCompressionContext *)refcon;
    CUPreviewProducer *owner=context.owner;
    if(owner)[owner receiveEncodedSample:sample status:status flags:flags context:context];
  }
}

@implementation CUPreviewProducer {
  id _context;
  NSLock *_stateLock;
  dispatch_queue_t _encoderQueue;
  CUPreviewPixelRenderer _renderer;
  AVSampleBufferDisplayLayer *_sampleDisplayLayer;
  AVSampleBufferDisplayLayer *_cursorDisplayLayer;
  NSUInteger _cursorSourceGeneration;
  BOOL _cursorSourceGenerationKnown;
  BOOL _cursorSourceHasGeneration;
  BOOL _cursorGeometryKnown;
  BOOL _cursorSampleRendered;
  CGRect _cursorTargetBounds;
  CGRect _cursorBounds;
  BOOL _nativeSampleRendering;
  BOOL _frameDeliverySuspended;
  double _maximumDisplaySize;
  CGSize _latestRawAspect;
  CGSize _pendingPresentationSize;
  CGSize _activePresentationSize;
  NSUInteger _nextPresentationRequestToken;
  NSUInteger _activePresentationRequestToken;
  BOOL _activePresentationPrepared;
  BOOL _activePresentationApplied;
  CUPreviewFence *_activePreparedFence;
  NSError *_presentationFailure;
  CUPreviewEncodedFrameHandler _frameHandler;
  BOOL _invalidated;
  BOOL _acceptingFrames;
  BOOL _hasRenderedPixels;
  CGSize _sourceSize;
  BOOL _published;
  BOOL _deliveryEnabled;
  BOOL _deliveryInFlight;
  NSUInteger _maximumPixelDimension;
  NSUInteger _encoderMaximum;
  size_t _encoderSourceWidth;
  size_t _encoderSourceHeight;
  NSUInteger _generation;
  NSUInteger _deliveryToken;
  CVPixelBufferRef _latestBuffer;
  NSUInteger _latestBufferSourceGeneration;
  CVPixelBufferRef _renderBuffer;
  CVPixelBufferRef _pendingRenderBuffer;
  CMSampleBufferRef _pendingRenderSample;
  NSUInteger _sourceFrameGeneration;
  NSUInteger _pendingSourceFrameGeneration;
  BOOL _sourceFrameGenerationKnown;
  BOOL _renderScheduled;
  VTCompressionSessionRef _compressionSession;
  CUPreviewCompressionContext *_compressionContext;
  NSError *_encodingFailure;
}

- (instancetype)initWithIdentity:(NSDictionary *)identity maximumPixelDimension:(double)maximumPixelDimension renderer:(CUPreviewPixelRenderer)renderer frameHandler:(CUPreviewEncodedFrameHandler)frameHandler error:(NSError **)error{
  return [self initWithIdentity:identity maximumPixelDimension:maximumPixelDimension maximumDisplaySize:200 renderer:renderer nativeSampleRendering:NO frameHandler:frameHandler error:error];
}
- (instancetype)initWithIdentity:(NSDictionary *)identity maximumPixelDimension:(double)maximumPixelDimension maximumDisplaySize:(double)maximumDisplaySize frameHandler:(CUPreviewEncodedFrameHandler)frameHandler error:(NSError **)error{
  return [self initWithIdentity:identity maximumPixelDimension:maximumPixelDimension maximumDisplaySize:maximumDisplaySize renderer:nil nativeSampleRendering:YES frameHandler:frameHandler error:error];
}
- (instancetype)initWithIdentity:(NSDictionary *)identity maximumPixelDimension:(double)maximumPixelDimension maximumDisplaySize:(double)maximumDisplaySize renderer:(CUPreviewPixelRenderer)renderer nativeSampleRendering:(BOOL)nativeSampleRendering frameHandler:(CUPreviewEncodedFrameHandler)frameHandler error:(NSError **)error{
  if(!NSThread.isMainThread){CUProducerFail(error,1,@"A remote layer producer must be created on the native owner main thread.");return nil;}
  for(NSString *key in @[@"presentationID",@"threadID",@"turnID",@"captureId",@"targetId",@"viewId",@"processIdentity"]){
    if(![identity[key]isKindOfClass:NSString.class]||![identity[key]length]){CUProducerFail(error,2,@"The producer requires explicit presentation, thread, turn, capture and target identities.");return nil;}
  }
  if(![identity[@"pid"]isKindOfClass:NSNumber.class]||[identity[@"pid"]intValue]<=0||![identity[@"windowId"]isKindOfClass:NSNumber.class]||![identity[@"windowId"]unsignedIntValue]||(!renderer&&!nativeSampleRendering)||!frameHandler||!isfinite(maximumPixelDimension)){
    CUProducerFail(error,2,@"The producer requires a selected window, native pixel renderer, frame transport and a valid maximum pixel dimension.");return nil;
  }
  Class contextClass=NSClassFromString(@"CAContext");SEL create=NSSelectorFromString(@"contextWithCGSConnection:options:");
  typedef int (*MainConnection)(void);MainConnection connection=(MainConnection)dlsym(RTLD_DEFAULT,"CGSMainConnectionID");
  if(!contextClass||![contextClass respondsToSelector:create]||!connection){CUProducerFail(error,3,@"Native remote layer contexts are unavailable in this process.");return nil;}
  id context=((id(*)(id,SEL,int,id))objc_msgSend)(contextClass,create,connection(),@{});
  SEL identifier=NSSelectorFromString(@"contextId"),setLayer=NSSelectorFromString(@"setLayer:");
  if(!context||![context respondsToSelector:identifier]||![context respondsToSelector:setLayer]){CUProducerFail(error,3,@"The native remote layer context does not provide the required layer interface.");return nil;}
  uint32_t contextID=((uint32_t(*)(id,SEL))objc_msgSend)(context,identifier);
  if(!contextID){CUProducerFail(error,3,@"The native remote layer context did not export a context identifier.");return nil;}
  if((self=[super init])){
    NSMutableDictionary *ownedIdentity=[identity mutableCopy];
    for(NSString *key in @[@"presentationID",@"threadID",@"turnID",@"captureId",@"targetId",@"viewId",@"processIdentity"])ownedIdentity[key]=[identity[key]copy];
    _identity=[ownedIdentity copy];_context=context;_contextID=contextID;_rootLayer=[CALayer layer];
    ((void(*)(id,SEL,id))objc_msgSend)(_context,setLayer,_rootLayer);
    _stateLock=[NSLock new];_acceptingFrames=YES;_renderer=[renderer copy];_frameHandler=[frameHandler copy];_maximumPixelDimension=(NSUInteger)MAX(2.,MIN(720.,ceil(maximumPixelDimension)));
    _nativeSampleRendering=nativeSampleRendering;_maximumDisplaySize=maximumDisplaySize;
    if(nativeSampleRendering){
      _sampleDisplayLayer=[AVSampleBufferDisplayLayer layer];_cursorDisplayLayer=[AVSampleBufferDisplayLayer layer];
      if(![_sampleDisplayLayer respondsToSelector:@selector(sampleBufferRenderer)]||![_sampleDisplayLayer.sampleBufferRenderer respondsToSelector:@selector(enqueueSampleBuffer:)]){CUProducerFail(error,3,@"The native sample-buffer renderer is unavailable.");return nil;}
      _sampleDisplayLayer.videoGravity=AVLayerVideoGravityResizeAspect;_cursorDisplayLayer.videoGravity=AVLayerVideoGravityResize;
      CGColorRef clear=NSColor.clearColor.CGColor;_rootLayer.backgroundColor=clear;_rootLayer.masksToBounds=YES;_cursorDisplayLayer.backgroundColor=clear;_cursorDisplayLayer.hidden=YES;
      _rootLayer.sublayers=@[_sampleDisplayLayer,_cursorDisplayLayer];
    }
    _encoderQueue=dispatch_queue_create("ai.trisoul.computer-use.preview-encoder",DISPATCH_QUEUE_SERIAL);
    dispatch_queue_set_specific(_encoderQueue,(__bridge void *)self,(__bridge void *)self,NULL);
  }
  return self;
}

- (void)onEncoderQueue:(dispatch_block_t)block wait:(BOOL)wait{
  if(dispatch_get_specific((__bridge void *)self))block();else if(wait)dispatch_sync(_encoderQueue,block);else dispatch_async(_encoderQueue,block);
}
- (BOOL)isInvalidated{[_stateLock lock];BOOL invalidated=_invalidated;[_stateLock unlock];return invalidated;}
- (CUPreviewFence *)createFence{
  if(!NSThread.isMainThread||[self isInvalidated])return nil;
  SEL create=NSSelectorFromString(@"createFencePort"),set=NSSelectorFromString(@"setFencePort:");
  if(![_context respondsToSelector:create]||![_context respondsToSelector:set])return nil;
  mach_port_t port=((mach_port_t(*)(id,SEL))objc_msgSend)(_context,create);
  return port==MACH_PORT_NULL?nil:[[CUPreviewFence alloc]initWithPort:port owner:self requestToken:_activePresentationRequestToken];
}
- (BOOL)setFence:(CUPreviewFence *)fence error:(NSError **)error{
  SEL selector=NSSelectorFromString(@"setFencePort:");
  if(!NSThread.isMainThread||[self isInvalidated]||fence.owner!=self||fence.contextID!=_contextID||fence.port==MACH_PORT_NULL||![_context respondsToSelector:selector])return CUProducerFail(error,4,@"The native producer cannot commit this fence.");
  ((void(*)(id,SEL,mach_port_t))objc_msgSend)(_context,selector,fence.port);return YES;
}
- (void)clearCompressionSession{
  _generation++;
  if(_compressionSession){VTCompressionSessionInvalidate(_compressionSession);CFRelease(_compressionSession);_compressionSession=NULL;}
  _compressionContext=nil;_encoderSourceWidth=0;_encoderSourceHeight=0;
}
- (void)failEncoding:(NSError *)error{
  _deliveryEnabled=NO;_deliveryInFlight=NO;_encodingFailure=error;
  void (^handler)(NSError *)=[self.failureHandler copy];if(handler){
    NSUInteger generation=_generation,token=_deliveryToken;__weak CUPreviewProducer *weak=self;
    dispatch_async(dispatch_get_main_queue(),^{
      CUPreviewProducer *owner=weak;if(!owner||owner.isInvalidated)return;
      __block BOOL current;[owner onEncoderQueue:^{current=generation==owner->_generation&&token==owner->_deliveryToken&&owner->_encodingFailure==error;} wait:YES];
      if(current&&!owner.isInvalidated)handler(error);
    });
  }
}
- (BOOL)configureEncoderForBuffer:(CVPixelBufferRef)buffer{
  size_t width=CVPixelBufferGetWidth(buffer),height=CVPixelBufferGetHeight(buffer);
  if(_compressionSession&&width==_encoderSourceWidth&&height==_encoderSourceHeight&&_maximumPixelDimension==_encoderMaximum)return YES;
  [self clearCompressionSession];
  double scale=MIN(1.,(double)_maximumPixelDimension/MAX(width,height));
  double roundedWidth=round(width*scale),roundedHeight=round(height*scale);
  if(!width||!height||!isfinite(roundedWidth)||!isfinite(roundedHeight)||roundedWidth>INT32_MAX||roundedHeight>INT32_MAX){[self failEncoding:CUProducerError(5,@"The native video dimensions are invalid.")];return NO;}
  int32_t encodedWidth=(int32_t)MAX(2,((NSUInteger)roundedWidth&~(NSUInteger)1));
  int32_t encodedHeight=(int32_t)MAX(2,((NSUInteger)roundedHeight&~(NSUInteger)1));
  CUPreviewCompressionContext *context=[CUPreviewCompressionContext new];context.owner=self;context.generation=_generation;
  NSDictionary *specification=@{(__bridge NSString *)kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder:@YES};
  OSStatus status=VTCompressionSessionCreate(kCFAllocatorDefault,encodedWidth,encodedHeight,(CMVideoCodecType)0x6d757861,(__bridge CFDictionaryRef)specification,NULL,NULL,CUPreviewCompressionOutput,(__bridge void *)context,&_compressionSession);
  if(status!=noErr||!_compressionSession){[self failEncoding:CUProducerError(status?:6,@"The alpha video encoder could not be created.")];return NO;}
  _compressionContext=context;_encoderSourceWidth=width;_encoderSourceHeight=height;_encoderMaximum=_maximumPixelDimension;
  VTSessionSetProperty(_compressionSession,kVTCompressionPropertyKey_RealTime,kCFBooleanTrue);
  VTSessionSetProperty(_compressionSession,kVTCompressionPropertyKey_AllowFrameReordering,kCFBooleanFalse);
  VTSessionSetProperty(_compressionSession,kVTCompressionPropertyKey_PreserveAlphaChannel,kCFBooleanTrue);
  VTSessionSetProperty(_compressionSession,kVTCompressionPropertyKey_ExpectedFrameRate,(__bridge CFNumberRef)@60);
  VTSessionSetProperty(_compressionSession,kVTCompressionPropertyKey_AverageBitRate,(__bridge CFNumberRef)@4000000);
  VTSessionSetProperty(_compressionSession,kVTCompressionPropertyKey_MaxKeyFrameInterval,(__bridge CFNumberRef)@60);
  VTSessionSetProperty(_compressionSession,kVTCompressionPropertyKey_TargetQualityForAlpha,(__bridge CFNumberRef)@.95);
  VTCompressionSessionPrepareToEncodeFrames(_compressionSession);return YES;
}
- (void)encodeLatestBuffer{
  if(!_deliveryEnabled||_deliveryInFlight||!_published||[self isInvalidated]||!_latestBuffer||![self isSourceFrameGenerationCurrent:_latestBufferSourceGeneration])return;
  if(![self configureEncoderForBuffer:_latestBuffer])return;
  uint64_t timestamp=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
  if(timestamp>INT64_MAX){[self failEncoding:CUProducerError(7,@"The native video timestamp is outside its supported range.")];return;}
  _deliveryInFlight=YES;_deliveryToken++;
  OSStatus status=VTCompressionSessionEncodeFrame(_compressionSession,_latestBuffer,CMTimeMake((int64_t)timestamp,1000000000),kCMTimeInvalid,NULL,NULL,NULL);
  if(status!=noErr)[self failEncoding:CUProducerError(status,@"The native video frame could not be encoded.")];
}
- (void)setPublished:(BOOL)published{[self onEncoderQueue:^{if(self.isInvalidated)return;self->_published=published;if(published)[self encodeLatestBuffer];} wait:NO];}
- (void)setVideoEnabled:(BOOL)enabled{
  [self onEncoderQueue:^{
    self->_deliveryEnabled=enabled&&!self.isInvalidated;
    if(!enabled){self->_deliveryInFlight=NO;self->_deliveryToken++;[self clearCompressionSession];}
    else{self->_encodingFailure=nil;[self encodeLatestBuffer];}
  } wait:NO];
}
- (BOOL)setMaximumPixelDimension:(double)maximumPixelDimension error:(NSError **)error{
  if(!isfinite(maximumPixelDimension))return CUProducerFail(error,2,@"The native maximum pixel dimension is invalid.");
  NSUInteger maximum=(NSUInteger)MAX(2.,MIN(720.,ceil(maximumPixelDimension)));
  if(self.isInvalidated)return CUProducerFail(error,3,@"The native producer is closed.");
  [self onEncoderQueue:^{if(!self.isInvalidated)self->_maximumPixelDimension=maximum;} wait:NO];return YES;
}
- (BOOL)setMaximumDisplaySize:(double)maximumDisplaySize error:(NSError **)error{
  if(!NSThread.isMainThread||!_nativeSampleRendering||self.isInvalidated)return CUProducerFail(error,4,@"Display sizing requires the live native sample renderer owner.");
  _maximumDisplaySize=isfinite(maximumDisplaySize)?MAX(100.,MIN(400.,round(maximumDisplaySize))):200.;
  if(_latestRawAspect.width>0&&_latestRawAspect.height>0)[self requestPresentationSize:CUPreviewPresentationSize(_latestRawAspect,_maximumDisplaySize)];
  return YES;
}
- (BOOL)prepareInitialSourceSize:(CGSize)sourceSize error:(NSError **)error{
  if(!NSThread.isMainThread||!_nativeSampleRendering||self.isInvalidated||!isfinite(sourceSize.width)||!isfinite(sourceSize.height)||sourceSize.width<=0||sourceSize.height<=0)return CUProducerFail(error,4,@"Initial native source sizing requires verified positive point dimensions.");
  [_stateLock lock];BOOL initial=_acceptingFrames&&!_hasRenderedPixels&&!_activePresentationRequestToken;[_stateLock unlock];
  if(!initial)return CUProducerFail(error,4,@"Initial sizing cannot replace an already rendered source.");
  CGSize size=CUPreviewPresentationSize(sourceSize,_maximumDisplaySize);
  [CATransaction begin];[CATransaction setDisableActions:YES];_rootLayer.frame=CGRectMake(0,0,size.width,size.height);_sampleDisplayLayer.frame=_rootLayer.bounds;[CATransaction commit];[CATransaction flush];
  [_stateLock lock];_sourceSize=size;[_stateLock unlock];[self applyCursorGeometry];return YES;
}
- (void)receivePixelBuffer:(CVPixelBufferRef)buffer{
  if(_nativeSampleRendering)return;
  [_stateLock lock];NSUInteger generation=_sourceFrameGeneration;[_stateLock unlock];[self receiveFrameBuffer:buffer sample:NULL sourceGeneration:generation];
}
- (void)receiveSampleBuffer:(CMSampleBufferRef)sample{
  [_stateLock lock];NSUInteger generation=_sourceFrameGeneration;[_stateLock unlock];[self receiveSampleBuffer:sample sourceGeneration:generation];
}
- (void)setSourceFrameGeneration:(NSUInteger)generation{
  [_stateLock lock];
  if(_invalidated||(_sourceFrameGenerationKnown&&generation<=_sourceFrameGeneration)){[_stateLock unlock];return;}
  _sourceFrameGeneration=generation;_sourceFrameGenerationKnown=YES;
  CVPixelBufferRef buffer=_pendingRenderBuffer;CMSampleBufferRef sample=_pendingRenderSample;_pendingRenderBuffer=NULL;_pendingRenderSample=NULL;[_stateLock unlock];
  if(buffer)CVPixelBufferRelease(buffer);if(sample)CFRelease(sample);
}
- (BOOL)isSourceFrameGenerationCurrent:(NSUInteger)generation{[_stateLock lock];BOOL current=!_invalidated&&(!_sourceFrameGenerationKnown||generation==_sourceFrameGeneration);[_stateLock unlock];return current;}
- (void)receiveSampleBuffer:(CMSampleBufferRef)sample sourceGeneration:(NSUInteger)generation{
  if(!sample||!CMSampleBufferIsValid(sample))return;
  CVPixelBufferRef buffer=CMSampleBufferGetImageBuffer(sample);if(!buffer&&!_nativeSampleRendering)return;
  [self receiveFrameBuffer:buffer sample:_nativeSampleRendering?sample:NULL sourceGeneration:generation];
}
- (BOOL)setCursorSourceGeneration:(NSUInteger)generation error:(NSError **)error{
  if(!NSThread.isMainThread||!_nativeSampleRendering||self.isInvalidated)return CUProducerFail(error,4,@"Cursor capture requires the live native renderer owner.");
  [_stateLock lock];BOOL current=_acceptingFrames&&(!_cursorSourceHasGeneration||generation>_cursorSourceGeneration);if(current){_cursorSourceGeneration=generation;_cursorSourceGenerationKnown=YES;_cursorSourceHasGeneration=YES;_cursorGeometryKnown=NO;_cursorSampleRendered=NO;}[_stateLock unlock];
  if(!current)return CUProducerFail(error,4,@"The cursor capture source generation is stale.");
  [CATransaction begin];[CATransaction setDisableActions:YES];_cursorDisplayLayer.hidden=YES;[_cursorDisplayLayer flush];[CATransaction commit];[CATransaction flush];return YES;
}
- (BOOL)setCursorTargetBounds:(CGRect)targetBounds cursorBounds:(CGRect)cursorBounds sourceGeneration:(NSUInteger)generation error:(NSError **)error{
  if(!NSThread.isMainThread||!_nativeSampleRendering||self.isInvalidated)return CUProducerFail(error,4,@"Cursor geometry requires the live native renderer owner.");
  double coordinates[]={targetBounds.origin.x,targetBounds.origin.y,targetBounds.size.width,targetBounds.size.height,cursorBounds.origin.x,cursorBounds.origin.y,cursorBounds.size.width,cursorBounds.size.height};for(NSUInteger i=0;i<8;i++)if(!isfinite(coordinates[i]))return CUProducerFail(error,4,@"Cursor geometry must contain finite native rectangles.");
  [_stateLock lock];BOOL current=_acceptingFrames&&_cursorSourceGenerationKnown&&generation==_cursorSourceGeneration;if(current){_cursorTargetBounds=targetBounds;_cursorBounds=cursorBounds;_cursorGeometryKnown=YES;}[_stateLock unlock];
  if(!current)return CUProducerFail(error,4,@"The cursor geometry does not belong to the active source generation.");
  [self applyCursorGeometry];return YES;
}
- (void)applyCursorGeometry{
  CALayer *parent=_cursorDisplayLayer.superlayer;if(!parent)return;
  [_stateLock lock];BOOL known=_cursorGeometryKnown;CGRect target=_cursorTargetBounds,cursor=_cursorBounds;[_stateLock unlock];
  CGSize size=parent.bounds.size;BOOL visible=known&&size.width>0&&size.height>0&&CGRectGetWidth(target)>0&&CGRectGetHeight(target)>0;
  [CATransaction begin];[CATransaction setDisableActions:YES];
  if(visible){double xScale=size.width/CGRectGetWidth(target),yScale=size.height/CGRectGetHeight(target);_cursorDisplayLayer.frame=CGRectMake((CGRectGetMinX(cursor)-CGRectGetMinX(target))*xScale,(CGRectGetMaxY(target)-CGRectGetMaxY(cursor))*yScale,CGRectGetWidth(cursor)*xScale,CGRectGetHeight(cursor)*yScale);_cursorDisplayLayer.hidden=NO;}
  else{_cursorDisplayLayer.hidden=YES;[_cursorDisplayLayer flush];}
  [CATransaction commit];[CATransaction flush];
}
- (void)receiveCursorSampleBuffer:(CMSampleBufferRef)sample sourceGeneration:(NSUInteger)generation{
  if(!sample||!CMSampleBufferIsValid(sample)||!_nativeSampleRendering)return;
  CFRetain(sample);__weak CUPreviewProducer *weak=self;
  dispatch_async(dispatch_get_main_queue(),^{
    CUPreviewProducer *owner=weak;
    if(owner){[owner->_stateLock lock];BOOL current=!owner->_invalidated&&owner->_acceptingFrames&&owner->_cursorSourceGenerationKnown&&generation==owner->_cursorSourceGeneration;[owner->_stateLock unlock];if(current&&!owner->_cursorDisplayLayer.hidden){[owner->_cursorDisplayLayer.sampleBufferRenderer enqueueSampleBuffer:sample];[owner->_stateLock lock];owner->_cursorSampleRendered=YES;[owner->_stateLock unlock];}}
    CFRelease(sample);
  });
}
- (void)clearCursorSource{
  if(!NSThread.isMainThread){__weak CUPreviewProducer *weak=self;dispatch_async(dispatch_get_main_queue(),^{[weak clearCursorSource];});return;}
  [_stateLock lock];_cursorSourceGenerationKnown=NO;_cursorGeometryKnown=NO;_cursorSampleRendered=NO;[_stateLock unlock];[self applyCursorGeometry];
}
- (BOOL)setFrameDeliverySuspended:(BOOL)suspended error:(NSError **)error{
  if(!NSThread.isMainThread||self.isInvalidated)return CUProducerFail(error,4,@"Frame suspension requires the live native owner main thread.");
  if(!suspended&&(_activePresentationRequestToken||!CGSizeEqualToSize(_pendingPresentationSize,CGSizeZero)))return CUProducerFail(error,4,@"A presentation size operation still requires its real host completion reply.");
  if(_frameDeliverySuspended!=suspended){_frameDeliverySuspended=suspended;if(suspended)[_sampleDisplayLayer flush];}return YES;
}
- (void)requestPresentationSize:(CGSize)size{
  if(self.isInvalidated)return;
  [_stateLock lock];
  if(!_acceptingFrames){[_stateLock unlock];return;}
  BOOL issue=!_activePresentationRequestToken&&!CGSizeEqualToSize(size,_sourceSize);
  _pendingPresentationSize=(_activePresentationRequestToken||issue)?size:CGSizeZero;
  if(issue){
    if(_nextPresentationRequestToken==NSUIntegerMax){_presentationFailure=CUProducerError(4,@"The native presentation size request sequence is exhausted.");[_stateLock unlock];[self setFrameDeliverySuspended:YES error:NULL];return;}
    _activePresentationRequestToken=++_nextPresentationRequestToken;_activePresentationSize=size;_activePresentationPrepared=NO;_activePresentationApplied=NO;_activePreparedFence=nil;_presentationFailure=nil;
  }
  NSUInteger token=_activePresentationRequestToken;[_stateLock unlock];
  if(issue){[self setFrameDeliverySuspended:YES error:NULL];if(self.presentationResizeHandler)self.presentationResizeHandler(size,token);}
}
- (BOOL)markPresentationSizeRequestPrepared:(NSUInteger)requestToken fence:(CUPreviewFence *)fence error:(NSError **)error{
  if(!NSThread.isMainThread||self.isInvalidated||!requestToken||requestToken!=_activePresentationRequestToken||fence.owner!=self||fence.contextID!=_contextID||fence.requestToken!=requestToken||fence.port==MACH_PORT_NULL||(_activePreparedFence&&_activePreparedFence!=fence))return CUProducerFail(error,4,@"The host prepare reply does not match the active native size request and fence.");
  [_stateLock lock];_activePreparedFence=fence;_activePresentationPrepared=YES;[_stateLock unlock];return YES;
}
- (BOOL)applyPresentationSize:(CGSize)size requestToken:(NSUInteger)requestToken preparedFence:(CUPreviewFence *)fence error:(NSError **)error{
  if(!NSThread.isMainThread||!_nativeSampleRendering||self.isInvalidated||!isfinite(size.width)||!isfinite(size.height)||size.width<=0||size.height<=0)return CUProducerFail(error,4,@"The native presentation point dimensions cannot be committed.");
  if(!requestToken||requestToken!=_activePresentationRequestToken||!_activePresentationPrepared||fence!=_activePreparedFence||!CGSizeEqualToSize(size,_activePresentationSize))return CUProducerFail(error,4,@"The native point-size commit does not match its prepared request.");
  if(_activePresentationApplied)return YES;
  if(![self setFence:fence error:error])return NO;
  [CATransaction begin];[CATransaction setDisableActions:YES];_rootLayer.frame=CGRectMake(0,0,size.width,size.height);_sampleDisplayLayer.frame=_rootLayer.bounds;[CATransaction commit];[CATransaction flush];
  [self applyCursorGeometry];
  [_stateLock lock];_sourceSize=size;_activePresentationApplied=YES;[_stateLock unlock];
  if(self.sourceSizeHandler)self.sourceSizeHandler(size);return YES;
}
- (BOOL)completePresentationSizeRequest:(NSUInteger)requestToken error:(NSError **)error{
  if(!NSThread.isMainThread||self.isInvalidated||!requestToken||requestToken!=_activePresentationRequestToken||!_activePresentationPrepared||!_activePresentationApplied)return CUProducerFail(error,4,@"The host completion reply does not match a committed native size request.");
  [_stateLock lock];CGSize next=_pendingPresentationSize;_activePresentationRequestToken=0;_activePresentationSize=CGSizeZero;_activePresentationPrepared=NO;_activePresentationApplied=NO;_activePreparedFence=nil;_presentationFailure=nil;_pendingPresentationSize=CGSizeZero;[_stateLock unlock];
  if(!CGSizeEqualToSize(next,CGSizeZero)&&!CGSizeEqualToSize(next,_sourceSize))[self requestPresentationSize:next];
  else [self setFrameDeliverySuspended:NO error:NULL];
  return YES;
}
- (BOOL)failPresentationSizeRequest:(NSUInteger)requestToken failure:(NSError *)failure error:(NSError **)error{
  if(!NSThread.isMainThread||self.isInvalidated||!requestToken||requestToken!=_activePresentationRequestToken||!failure)return CUProducerFail(error,4,@"The failed host operation does not match the active native size request.");
  [_stateLock lock];_presentationFailure=failure;[_stateLock unlock];[self setFrameDeliverySuspended:YES error:NULL];if(self.failureHandler)self.failureHandler(failure);return YES;
}
- (void)receiveFrameBuffer:(CVPixelBufferRef)buffer sample:(CMSampleBufferRef)sample sourceGeneration:(NSUInteger)generation{
  if(!buffer&&!sample)return;
  if(buffer)CVPixelBufferRetain(buffer);if(sample)CFRetain(sample);
  [_stateLock lock];
  if(!_acceptingFrames||_invalidated||(_sourceFrameGenerationKnown&&generation!=_sourceFrameGeneration)){[_stateLock unlock];if(buffer)CVPixelBufferRelease(buffer);if(sample)CFRelease(sample);return;}
  CVPixelBufferRef previous=_pendingRenderBuffer;CMSampleBufferRef previousSample=_pendingRenderSample;_pendingRenderBuffer=buffer;_pendingRenderSample=sample;_pendingSourceFrameGeneration=generation;
  BOOL schedule=!_renderScheduled;_renderScheduled=YES;[_stateLock unlock];
  if(previous)CVPixelBufferRelease(previous);if(previousSample)CFRelease(previousSample);if(!schedule)return;
  __weak CUPreviewProducer *weak=self;
  dispatch_async(dispatch_get_main_queue(),^{
    CUPreviewProducer *owner=weak;if(!owner)return;
    [owner->_stateLock lock];CVPixelBufferRef buffer=owner->_pendingRenderBuffer;CMSampleBufferRef sample=owner->_pendingRenderSample;NSUInteger generation=owner->_pendingSourceFrameGeneration;owner->_pendingRenderBuffer=NULL;owner->_pendingRenderSample=NULL;owner->_renderScheduled=NO;BOOL accepted=(buffer||sample)&&owner->_acceptingFrames&&!owner->_invalidated&&(!owner->_sourceFrameGenerationKnown||generation==owner->_sourceFrameGeneration);[owner->_stateLock unlock];
    if(!accepted){if(buffer)CVPixelBufferRelease(buffer);if(sample)CFRelease(sample);return;}
    if(owner->_nativeSampleRendering){
      CGSize aspect=CGSizeZero;
      if(buffer)aspect=CGSizeMake(CVPixelBufferGetWidth(buffer),CVPixelBufferGetHeight(buffer));
      else{CMFormatDescriptionRef format=CMSampleBufferGetFormatDescription(sample);if(format&&CMFormatDescriptionGetMediaType(format)==kCMMediaType_Video){CMVideoDimensions dimensions=CMVideoFormatDescriptionGetDimensions(format);aspect=CGSizeMake(dimensions.width,dimensions.height);}}
      if(aspect.width<=0||aspect.height<=0){
        NSArray *attachments=(__bridge NSArray *)CMSampleBufferGetSampleAttachmentsArray(sample,NO);NSDictionary *info=attachments.firstObject;
        for(NSString *key in @[SCStreamFrameInfoContentRect,SCStreamFrameInfoBoundingRect]){id value=info[key];if(![value isKindOfClass:NSValue.class]||strcmp([value objCType],@encode(CGRect))!=0)continue;CGRect rect=[value rectValue];if(CGRectGetWidth(rect)>0&&CGRectGetHeight(rect)>0){aspect=rect.size;break;}}
      }
      if(aspect.width>0&&aspect.height>0)owner->_latestRawAspect=aspect;
      CGSize desired=aspect.width>0&&aspect.height>0?CUPreviewPresentationSize(aspect,owner->_maximumDisplaySize):owner->_sourceSize;
      if(!owner->_hasRenderedPixels&&desired.width>0&&desired.height>0){
        [CATransaction begin];[CATransaction setDisableActions:YES];owner.rootLayer.frame=CGRectMake(0,0,desired.width,desired.height);owner->_sampleDisplayLayer.frame=owner.rootLayer.bounds;[CATransaction commit];[CATransaction flush];
        [owner applyCursorGeometry];
      }else if(desired.width>0&&desired.height>0)[owner requestPresentationSize:desired];
    }
    if(owner->_frameDeliverySuspended){if(buffer)CVPixelBufferRelease(buffer);if(sample)CFRelease(sample);return;}
    NSError *error;
    [CATransaction begin];[CATransaction setDisableActions:YES];
    BOOL rendered;
    if(owner->_nativeSampleRendering){[owner->_sampleDisplayLayer.sampleBufferRenderer enqueueSampleBuffer:sample];rendered=YES;}
    else rendered=owner->_renderer(owner.rootLayer,buffer,&error);
    CGSize size=owner.rootLayer.bounds.size;[CATransaction commit];if(owner->_nativeSampleRendering)[CATransaction flush];if(sample)CFRelease(sample);
    if(rendered&&(!isfinite(size.width)||!isfinite(size.height)||size.width<=0||size.height<=0)){rendered=NO;error=CUProducerError(8,@"The native renderer did not provide presentation-point dimensions.");}
    if(!rendered){[owner onEncoderQueue:^{[owner failEncoding:error?:CUProducerError(8,@"The native pixel renderer did not accept this frame.")];} wait:NO];if(buffer)CVPixelBufferRelease(buffer);return;}
    if(buffer){if(owner->_renderBuffer)CVPixelBufferRelease(owner->_renderBuffer);owner->_renderBuffer=CVPixelBufferRetain(buffer);}
    [owner->_stateLock lock];BOOL changed=!owner->_hasRenderedPixels||!CGSizeEqualToSize(owner->_sourceSize,size);BOOL invalidated=owner->_invalidated||!owner->_acceptingFrames||(owner->_sourceFrameGenerationKnown&&generation!=owner->_sourceFrameGeneration);if(!invalidated){owner->_sourceSize=size;owner->_hasRenderedPixels=YES;}[owner->_stateLock unlock];
    if(invalidated){if(buffer)CVPixelBufferRelease(buffer);return;}
    if(changed&&owner.sourceSizeHandler)owner.sourceSizeHandler(size);
    if(buffer)[owner onEncoderQueue:^{
      if([owner isSourceFrameGenerationCurrent:generation]){if(owner->_latestBuffer)CVPixelBufferRelease(owner->_latestBuffer);owner->_latestBuffer=CVPixelBufferRetain(buffer);owner->_latestBufferSourceGeneration=generation;[owner encodeLatestBuffer];}
      CVPixelBufferRelease(buffer);
    } wait:NO];
  });
}
- (void)receiveEncodedSample:(CMSampleBufferRef)sample status:(OSStatus)status flags:(VTEncodeInfoFlags)flags context:(CUPreviewCompressionContext *)context{
  if(sample)CFRetain(sample);
  [self onEncoderQueue:^{
    @try{
      if(context!=self->_compressionContext||context.generation!=self->_generation||!self->_deliveryInFlight||self.isInvalidated)return;
      if(status!=noErr){[self failEncoding:CUProducerError(status,@"The native video encoder rejected a frame.")];return;}
      CMBlockBufferRef data=sample?CMSampleBufferGetDataBuffer(sample):NULL;CMFormatDescriptionRef format=sample?CMSampleBufferGetFormatDescription(sample):NULL;
      if((flags&kVTEncodeInfo_FrameDropped)||!data||!format){[self failEncoding:CUProducerError(10,@"The video encoder did not produce a complete encoded frame.")];return;}
      NSMutableData *video=[NSMutableData dataWithLength:CMBlockBufferGetDataLength(data)];
      OSStatus copied=CMBlockBufferCopyDataBytes(data,0,video.length,video.mutableBytes);
      if(copied!=noErr){[self failEncoding:CUProducerError(copied,@"The encoded frame bytes could not be copied.")];return;}
      BOOL notSync=NO;CFArrayRef attachments=CMSampleBufferGetSampleAttachmentsArray(sample,NO);
      if(attachments&&CFArrayGetCount(attachments)){CFDictionaryRef info=CFArrayGetValueAtIndex(attachments,0);CFTypeRef value=CFDictionaryGetValue(info,kCMSampleAttachmentKey_NotSync);if(value&&CFGetTypeID(value)==CFBooleanGetTypeID())notSync=CFBooleanGetValue(value);}
      id configuration=nil;
      if(!notSync){id atoms=(__bridge id)CMFormatDescriptionGetExtension(format,kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms);if([atoms isKindOfClass:NSDictionary.class]&&[atoms[@"hvcC"]isKindOfClass:NSData.class])configuration=[atoms[@"hvcC"]copy];}
      double nanoseconds=CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))*1000000000.;
      if(!isfinite(nanoseconds)||nanoseconds<0||nanoseconds>=18446744073709551616.){[self failEncoding:CUProducerError(7,@"The encoded frame timestamp is invalid.")];return;}
      NSDictionary *frame=@{@"presentationID":self.identity[@"presentationID"],@"threadID":self.identity[@"threadID"],@"codec":@"hvc1.1.6.L93.B0",@"decoderConfiguration":configuration?:NSNull.null,@"timestamp":@((uint64_t)nanoseconds),@"isKeyFrame":@(!notSync),@"videoData":[video copy]};
      NSUInteger generation=self->_generation,token=self->_deliveryToken;__weak CUPreviewProducer *weak=self;CUPreviewEncodedFrameHandler handler=self->_frameHandler;
      dispatch_async(dispatch_get_main_queue(),^{
        CUPreviewProducer *owner=weak;if(!owner||owner.isInvalidated)return;
        __block BOOL current;
        [owner onEncoderQueue:^{current=owner->_deliveryEnabled&&owner->_published&&generation==owner->_generation&&token==owner->_deliveryToken;} wait:YES];
        if(!current){
          [owner onEncoderQueue:^{if(owner->_deliveryEnabled&&owner->_deliveryInFlight&&generation==owner->_generation&&token==owner->_deliveryToken)[owner failEncoding:CUProducerError(11,@"The native presentation is no longer published.")];} wait:NO];
          return;
        }
        handler(frame,^(NSError *error){
          CUPreviewProducer *current=weak;if(!current)return;
          [current onEncoderQueue:^{
            if(generation!=current->_generation||token!=current->_deliveryToken||!current->_deliveryInFlight)return;
            current->_deliveryInFlight=NO;
            if(error)[current failEncoding:error];
          } wait:NO];
        });
      });
    }@finally{if(sample)CFRelease(sample);}
  } wait:NO];
}
- (NSDictionary *)snapshot{
  [_stateLock lock];BOOL invalidated=_invalidated,rendered=_hasRenderedPixels,cursorKnown=_cursorGeometryKnown,cursorRendered=_cursorSampleRendered,cursorSourceKnown=_cursorSourceGenerationKnown;NSUInteger cursorGeneration=_cursorSourceGeneration;CGSize size=_sourceSize,pending=_pendingPresentationSize,requested=_activePresentationSize;NSUInteger requestToken=_activePresentationRequestToken;BOOL prepared=_activePresentationPrepared,applied=_activePresentationApplied;NSString *presentationFailure=_presentationFailure.localizedDescription;[_stateLock unlock];
  __block NSDictionary *video;
  [self onEncoderQueue:^{video=@{@"videoEnabled":@(self->_deliveryEnabled),@"videoFrameInFlight":@(self->_deliveryInFlight),@"published":@(self->_published),@"maximumPixelDimension":@(self->_maximumPixelDimension),@"encodingFailure":self->_encodingFailure.localizedDescription?:NSNull.null};} wait:YES];
  NSMutableDictionary *result=[self.identity mutableCopy];[result addEntriesFromDictionary:video];result[@"nativeContextAvailable"]=@(!invalidated);result[@"sourcePixelsRendered"]=@(!invalidated&&rendered);result[@"nativeSampleBufferRenderer"]=@(_nativeSampleRendering);result[@"nativeCursorCompositing"]=@(!invalidated&&cursorSourceKnown&&cursorKnown&&cursorRendered);result[@"nativeCursorGeometryAvailable"]=@(!invalidated&&cursorKnown);result[@"nativeCursorSampleRendered"]=@(!invalidated&&cursorRendered);result[@"cursorSourceGeneration"]=cursorSourceKnown?@(cursorGeneration):NSNull.null;result[@"presentationResizePending"]=@(requestToken||!CGSizeEqualToSize(pending,CGSizeZero));result[@"presentationSizeRequestToken"]=requestToken?@(requestToken):NSNull.null;result[@"requestedWidth"]=@(requested.width);result[@"requestedHeight"]=@(requested.height);result[@"pendingWidth"]=@(pending.width);result[@"pendingHeight"]=@(pending.height);result[@"presentationSizePrepared"]=@(prepared);result[@"presentationSizeApplied"]=@(applied);result[@"presentationSizeFailure"]=presentationFailure?:NSNull.null;result[@"contextID"]=@(_contextID);result[@"sourceWidth"]=@(size.width);result[@"sourceHeight"]=@(size.height);return result;
}
- (void)stopVideoDelivery{
  [_stateLock lock];_acceptingFrames=NO;CVPixelBufferRef pending=_pendingRenderBuffer;CMSampleBufferRef sample=_pendingRenderSample;_pendingRenderBuffer=NULL;_pendingRenderSample=NULL;[_stateLock unlock];if(pending)CVPixelBufferRelease(pending);if(sample)CFRelease(sample);[self setVideoEnabled:NO];
}
- (void)invalidate{
  [_stateLock lock];if(_invalidated){[_stateLock unlock];return;}_invalidated=YES;_acceptingFrames=NO;CVPixelBufferRef pending=_pendingRenderBuffer;CMSampleBufferRef sample=_pendingRenderSample;_pendingRenderBuffer=NULL;_pendingRenderSample=NULL;[_stateLock unlock];if(pending)CVPixelBufferRelease(pending);if(sample)CFRelease(sample);
  [self onEncoderQueue:^{self->_deliveryEnabled=NO;self->_deliveryInFlight=NO;self->_published=NO;self->_deliveryToken++;[self clearCompressionSession];if(self->_latestBuffer){CVPixelBufferRelease(self->_latestBuffer);self->_latestBuffer=NULL;}} wait:YES];
  dispatch_block_t detach=^{
    [CATransaction begin];[CATransaction setDisableActions:YES];self->_cursorDisplayLayer.hidden=YES;[self->_cursorDisplayLayer flush];[CATransaction commit];[CATransaction flush];
    ((void(*)(id,SEL,id))objc_msgSend)(self->_context,NSSelectorFromString(@"setLayer:"),nil);self->_rootLayer.contents=nil;if(self->_renderBuffer){CVPixelBufferRelease(self->_renderBuffer);self->_renderBuffer=NULL;}
  };
  if(NSThread.isMainThread)detach();else dispatch_async(dispatch_get_main_queue(),detach);
}
- (void)dealloc{
  if(_compressionSession){VTCompressionSessionInvalidate(_compressionSession);CFRelease(_compressionSession);}
  if(_latestBuffer)CVPixelBufferRelease(_latestBuffer);
  if(_pendingRenderBuffer)CVPixelBufferRelease(_pendingRenderBuffer);
  if(_pendingRenderSample)CFRelease(_pendingRenderSample);
  id context=_context;CALayer *rootLayer=_rootLayer;CVPixelBufferRef rendered=_renderBuffer;
  if(!_invalidated){dispatch_block_t detach=^{((void(*)(id,SEL,id))objc_msgSend)(context,NSSelectorFromString(@"setLayer:"),nil);rootLayer.contents=nil;if(rendered)CVPixelBufferRelease(rendered);};if(NSThread.isMainThread)detach();else dispatch_async(dispatch_get_main_queue(),detach);}
  else if(rendered)CVPixelBufferRelease(rendered);
}
@end
