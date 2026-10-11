#import "PreviewBridge.h"
#import "ComputerUse.h"
#import "../transport/CUMachChannel.h"
#import <CoreFoundation/CoreFoundation.h>
#import <math.h>
#import <limits.h>

NSString *const CUPreviewBridgeErrorDomain=@"ai.trisoul.computer-use.preview-bridge";

static NSError *CUBridgeError(NSInteger code,NSString *message){
  return [NSError errorWithDomain:CUPreviewBridgeErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey:message}];
}
static BOOL CUBridgeFail(NSError **error,NSInteger code,NSString *message){if(error)*error=CUBridgeError(code,message);return NO;}
static void CUBridgeOnMain(dispatch_block_t block){if(NSThread.isMainThread)block();else dispatch_async(dispatch_get_main_queue(),block);}
static BOOL CUBridgeString(id value){return [value isKindOfClass:NSString.class]&&[value length]>0;}
static BOOL CUBridgeUnsigned(id value,uint64_t maximum,uint64_t minimum){
  if(![value isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID())return NO;
  double number=[value doubleValue];return isfinite(number)&&number>=minimum&&number<=maximum&&floor(number)==number;
}
static BOOL CUBridgeBoolean(id value){return value&&CFGetTypeID((__bridge CFTypeRef)value)==CFBooleanGetTypeID();}
static BOOL CUBridgePositiveSize(CGSize size){return isfinite(size.width)&&isfinite(size.height)&&size.width>0&&size.height>0;}
static NSArray<NSString *> *CUBridgeIdentityKeys(void){
  return @[@"presentationID",@"threadID",@"turnID",@"sourceGeneration",@"targetId",@"viewId",@"captureId",@"pid",@"windowId",@"processIdentity"];
}

@interface CUPreviewBridgeResize : NSObject
@property NSUInteger requestToken;
@property uint64_t operationID;
@property CGSize size;
@property CUPreviewFence *fence;
@property CUMachSendRight *sendRight;
@property NSString *stage;
@property NSError *failure;
@end
@implementation CUPreviewBridgeResize
@end

@interface CUPreviewBridgeCommand : NSObject
@property(copy) CUPreviewBridgeCompletion completion;
@end
@implementation CUPreviewBridgeCommand
@end

@interface CUPreviewBridge ()
- (BOOL)matchesIdentity:(NSDictionary *)value;
- (void)publishIfReady;
- (void)receiveEncodedFrame:(NSDictionary *)frame reply:(CUPreviewFrameReply)reply;
- (void)requestResize:(CGSize)size token:(NSUInteger)token;
- (void)preparePendingResize;
- (void)reportFailure:(NSError *)error phase:(NSString *)phase;
- (void)finishStart:(NSError *_Nullable)error;
- (void)stopCaptureForClose;
- (void)requestHostEnd;
- (void)requestHostDetach;
- (void)finalizeDetach;
- (void)finishClose:(NSError *_Nullable)error;
@end

@implementation CUPreviewBridge {
  __weak CUSession *_session;
  CUMachClient *_channel;
  NSDictionary *_hostEndpoint;
  CUPreviewBridgeNotificationHandler _notificationHandler;
  NSMutableArray *_startCompletions;
  NSMutableArray *_closeCompletions;
  NSMutableArray<CUPreviewBridgeCommand *> *_displayCompletions;
  NSMutableArray<CUPreviewBridgeCommand *> *_videoEnableCompletions;
  BOOL _started;
  BOOL _startAbandoned;
  NSUInteger _startDeadlineToken;
  NSUInteger _closeDeadlineToken;
  BOOL _channelReady;
  BOOL _publishRequestSent;
  BOOL _publishInFlight;
  BOOL _published;
  BOOL _closing;
  BOOL _captureStopInFlight;
  BOOL _captureStopped;
  BOOL _endAccepted;
  BOOL _endRequestInFlight;
  BOOL _detachRequestInFlight;
  BOOL _detachConfirmed;
  BOOL _providerDestroyed;
  NSError *_lastFailure;
  NSError *_channelFailure;
  CUPreviewBridgeResize *_resize;
  uint64_t _lastCompletedOperationID;
  uint64_t _frameSequence;
  NSDictionary *_pendingFrameIdentity;
  CUPreviewFrameReply _pendingFrameReply;
}

- (instancetype)initWithSession:(CUSession *)session arguments:(NSDictionary *)arguments notificationHandler:(CUPreviewBridgeNotificationHandler)notificationHandler error:(NSError **)error{
  if(!NSThread.isMainThread){CUBridgeFail(error,1,@"The native preview bridge must be created on its owner main thread.");return nil;}
  if(!session||![arguments isKindOfClass:NSDictionary.class]||!notificationHandler){CUBridgeFail(error,2,@"The native preview requires a live read-only session, identities and notification delivery.");return nil;}
  NSMutableDictionary *identity=[NSMutableDictionary new];
  for(NSString *key in CUBridgeIdentityKeys()){
    id value=arguments[key];
    BOOL valid=[@[@"sourceGeneration",@"pid",@"windowId"]containsObject:key]?
      CUBridgeUnsigned(value,[key isEqual:@"pid"]?INT_MAX:UINT32_MAX,1):CUBridgeString(value);
    if(!valid){CUBridgeFail(error,2,[NSString stringWithFormat:@"The native preview requires its actual %@ identity.",key]);return nil;}
    identity[key]=[value copy];
  }
  NSDictionary *endpoint=arguments[@"hostEndpoint"];
  NSData *nonce=[endpoint isKindOfClass:NSDictionary.class]&&CUBridgeString(endpoint[@"nonce"])?[[NSData alloc]initWithBase64EncodedString:endpoint[@"nonce"] options:0]:nil;
  if(![endpoint isKindOfClass:NSDictionary.class]||!CUBridgeString(endpoint[@"name"])||!nonce||!CUBridgeUnsigned(endpoint[@"pid"],INT_MAX,1)||!CUBridgeUnsigned(endpoint[@"pidVersion"],INT_MAX,1)||!CUBridgeUnsigned(endpoint[@"euid"],UINT_MAX,0)){
    CUBridgeFail(error,2,@"A trusted host endpoint requires its real name, nonce, PID, PID version and EUID.");return nil;
  }
  NSError *failure;
  NSDictionary *source=CUPreviewSourceIdentity(session,&failure);
  if(!source){if(error)*error=failure?:CUBridgeError(3,@"The selected read-only capture is unavailable.");return nil;}
  if(![source[@"pixelBufferProducerSourceAvailable"]boolValue]||[source[@"stopped"]boolValue]){CUBridgeFail(error,3,@"The selected capture does not expose a live native sample-buffer source.");return nil;}
  for(NSString *key in @[@"captureId",@"pid",@"windowId",@"processIdentity"]){
    if(![identity[key]isEqual:source[key]]){CUBridgeFail(error,3,@"The native presentation does not match the current capture, process and selected window.");return nil;}
  }
  id pixelMaximum=arguments[@"maximumPixelDimension"]?:@720;
  id displayMaximum=arguments[@"maximumDisplaySize"]?:@200;
  if(![pixelMaximum isKindOfClass:NSNumber.class]||!isfinite([pixelMaximum doubleValue])||![displayMaximum isKindOfClass:NSNumber.class]){CUBridgeFail(error,2,@"The native preview maximum dimensions must be numeric.");return nil;}
  if((self=[super init])){
    NSMutableDictionary *ownedEndpoint=[NSMutableDictionary new];
    for(NSString *key in @[@"name",@"nonce",@"pid",@"pidVersion",@"euid"])ownedEndpoint[key]=[endpoint[key]copy];
    _session=session;_identity=[identity copy];_bridgeSessionId=NSUUID.UUID.UUIDString;_hostEndpoint=[ownedEndpoint copy];_notificationHandler=[notificationHandler copy];
    _startCompletions=[NSMutableArray new];_closeCompletions=[NSMutableArray new];_displayCompletions=[NSMutableArray new];_videoEnableCompletions=[NSMutableArray new];
    __weak CUPreviewBridge *weak=self;
    _channel=[[CUMachClient alloc]initWithServiceName:endpoint[@"name"] expectedPeerPID:[endpoint[@"pid"]intValue] euid:[endpoint[@"euid"]unsignedIntValue] pidVersion:[endpoint[@"pidVersion"]intValue] nonce:nonce allowedOperations:[NSSet setWithArray:@[@"publishPresentation",@"prepareOperation",@"completeOperation",@"willEndStream",@"sourceDidEndStream"]] maxInFlight:4 errorHandler:^(NSError *channelError){
      CUPreviewBridge *owner=weak;if(!owner||owner.isClosed)return;
      [owner.producer setVideoEnabled:NO];
      owner->_channelFailure=channelError;[owner reportFailure:channelError phase:@"channel"];
      [owner finishStart:channelError];
      [owner finishDisplayCommands:channelError];
      [owner finishVideoEnableCommands:channelError];
      if(owner->_closing)[owner finishClose:channelError];
    } error:&failure];
    if(!_channel){if(error)*error=failure;return nil;}
    _producer=[[CUPreviewProducer alloc]initWithIdentity:_identity maximumPixelDimension:[pixelMaximum doubleValue] maximumDisplaySize:[displayMaximum doubleValue] frameHandler:^(NSDictionary *frame,CUPreviewFrameReply reply){
      CUPreviewBridge *owner=weak;
      if(owner)[owner receiveEncodedFrame:frame reply:reply];
      else reply(CUBridgeError(4,@"The native frame source owner is no longer available."));
    } error:&failure];
    if(!_producer){[_channel close];if(error)*error=failure;return nil;}
    _producer.sourceSizeHandler=^(CGSize size){(void)size;CUPreviewBridge *owner=weak;if(owner)[owner publishIfReady];};
    _producer.presentationResizeHandler=^(CGSize size,NSUInteger token){CUPreviewBridge *owner=weak;if(owner)[owner requestResize:size token:token];};
    _producer.failureHandler=^(NSError *producerError){CUPreviewBridge *owner=weak;if(owner){[owner reportFailure:producerError phase:@"producer"];[owner finishDisplayCommands:producerError];if(!owner->_published)[owner finishStart:producerError];}};
    if(!CUBindPreviewProducer(session,_producer,&failure)){[_producer invalidate];[_channel close];if(error)*error=failure;return nil;}
    id cursorOwner=arguments[@"owner_session_label"]?:arguments[@"ownerSessionLabel"];if([cursorOwner isKindOfClass:NSString.class])CUUpdatePreviewCursorOwnerSessionLabel(session,cursorOwner);
  }
  return self;
}

- (NSDictionary *)wireIdentity{
  NSMutableDictionary *value=[self.identity mutableCopy];value[@"bridgeSessionId"]=self.bridgeSessionId;return [value copy];
}
- (BOOL)matchesIdentity:(NSDictionary *)value{
  if(![value isKindOfClass:NSDictionary.class]||![value[@"bridgeSessionId"]isEqual:self.bridgeSessionId])return NO;
  for(NSString *key in CUBridgeIdentityKeys())if(![value[key]isEqual:self.identity[key]])return NO;
  return YES;
}
- (NSError *)replyFailure:(NSDictionary *)reply flag:(NSString *)flag error:(NSError *)error{
  if(error)return error;
  if(![self matchesIdentity:reply]||!CUBridgeBoolean(reply[flag])||![reply[flag]boolValue])return CUBridgeError(5,@"The host reply does not confirm this native source identity and operation.");
  return nil;
}
- (void)notify:(NSString *)method parameters:(NSDictionary *)parameters{
  @try{_notificationHandler(method,parameters);}@catch(NSException *exception){_lastFailure=CUBridgeError(6,exception.reason?:@"Native notification delivery failed.");}
}
- (void)notifyType:(NSString *)type parameters:(NSDictionary *)parameters{
  NSMutableDictionary *value=[parameters mutableCopy];value[@"type"]=type;
  [self notify:@"notifications/native-presentation" parameters:value];
}
- (void)reportFailure:(NSError *)error phase:(NSString *)phase{
  _lastFailure=error;NSMutableDictionary *value=[[self snapshot]mutableCopy];
  value[@"phase"]=phase;value[@"error"]=@{@"domain":error.domain,@"code":@(error.code),@"message":error.localizedDescription?:@"Native preview failed."};
  value[@"cleanupPending"]=@(_closing&&!_closed);if(_resize){value[@"operationID"]=@(_resize.operationID);value[@"requestToken"]=@(_resize.requestToken);value[@"operationStage"]=_resize.stage?:@"waiting";}
  [self notifyType:@"state" parameters:value];
}
- (void)finishStart:(NSError *)error{
  _startDeadlineToken++;
  NSArray *completions=[_startCompletions copy];[_startCompletions removeAllObjects];
  NSDictionary *result=[self snapshot];
  for(CUPreviewBridgeCompletion completion in completions)completion(result,error);
}
- (void)startWithCompletion:(CUPreviewBridgeCompletion)completion{
  CUBridgeOnMain(^{
    if(self->_closed||self->_closing){completion(nil,CUBridgeError(4,@"The native presentation is closing or closed."));return;}
    if(self->_published){completion([self snapshot],nil);return;}
    if(self->_channelFailure||self->_lastFailure||self->_startAbandoned){completion(nil,self->_channelFailure?:self->_lastFailure?:CUBridgeError(11,@"The native presentation start deadline expired."));return;}
    if(!self->_startCompletions.count){
      NSUInteger deadlineToken=++self->_startDeadlineToken;__weak CUPreviewBridge *weak=self;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW,45*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        CUPreviewBridge *owner=weak;if(!owner||owner.isClosed||owner->_startDeadlineToken!=deadlineToken||!owner->_startCompletions.count)return;
        owner->_startAbandoned=YES;NSError *error=CUBridgeError(11,@"The native presentation did not receive a rendered source and host publication reply before its deadline.");
        [owner reportFailure:error phase:@"start-deadline"];[owner finishStart:error];
      });
    }
    [self->_startCompletions addObject:[completion copy]];
    if(self->_started){[self publishIfReady];return;}
    self->_started=YES;__weak CUPreviewBridge *weak=self;
    [self notifyType:@"state" parameters:[self snapshot]];
    [self->_channel startWithCompletion:^(NSError *error){
      CUPreviewBridge *owner=weak;if(!owner||owner.isClosed)return;
      if(error){owner->_channelFailure=error;[owner reportFailure:error phase:@"channel-start"];[owner finishStart:error];if(owner->_closing)[owner finishClose:error];return;}
      owner->_channelReady=YES;
      if(owner->_closing)[owner requestHostEnd];else [owner publishIfReady];
    }];
  });
}
- (void)publishIfReady{
  if(_closed||_closing||_startAbandoned||!_channelReady||_publishRequestSent||_channelFailure)return;
  NSDictionary *source=[_producer snapshot];CGSize size=_producer.rootLayer.bounds.size;
  if(![source[@"sourcePixelsRendered"]boolValue]||![source[@"nativeContextAvailable"]boolValue]||!_producer.contextID||!CUBridgePositiveSize(size)||[source[@"sourceWidth"]doubleValue]!=size.width||[source[@"sourceHeight"]doubleValue]!=size.height)return;
  NSMutableDictionary *metadata=[[self wireIdentity]mutableCopy];metadata[@"contextID"]=@(_producer.contextID);metadata[@"width"]=@(size.width);metadata[@"height"]=@(size.height);
  _publishRequestSent=YES;_publishInFlight=YES;__weak CUPreviewBridge *weak=self;
  [_channel sendRequestOperation:@"publishPresentation" metadata:metadata sendRight:nil timeout:30 completion:^(NSDictionary *reply,CUMachSendRight *right,NSError *error){
    (void)right;CUPreviewBridge *owner=weak;if(!owner||owner.isClosed)return;owner->_publishInFlight=NO;
    NSError *failure=[owner replyFailure:reply flag:@"published" error:error];
    if(!failure&&(![reply[@"contextID"]isEqual:metadata[@"contextID"]]||![reply[@"width"]isEqual:metadata[@"width"]]||![reply[@"height"]isEqual:metadata[@"height"]]))failure=CUBridgeError(5,@"The host published different native context or presentation-point geometry.");
    if(failure){[owner reportFailure:failure phase:@"publish"];[owner finishStart:failure];}
    else {owner->_published=YES;[owner.producer setPublished:YES];[owner finishStart:nil];if(!owner->_closing)[owner preparePendingResize];}
    if(owner->_closing)[owner requestHostEnd];
  }];
}

- (void)requestResize:(CGSize)size token:(NSUInteger)token{
  if(_closed||_closing||!token||!CUBridgePositiveSize(size))return;
  if(_resize){if(_resize.requestToken!=token||!CGSizeEqualToSize(_resize.size,size))[self reportFailure:CUBridgeError(7,@"The producer issued a concurrent native size request.") phase:@"resize"];return;}
  if(_lastCompletedOperationID>=9007199254740991ULL){NSError *error=CUBridgeError(7,@"The host native operation sequence is exhausted.");[_producer failPresentationSizeRequest:token failure:error error:NULL];return;}
  _resize=[CUPreviewBridgeResize new];_resize.requestToken=token;_resize.operationID=_lastCompletedOperationID+1;_resize.size=size;_resize.stage=@"waiting-for-publish";
  [self preparePendingResize];
}
- (void)failResize:(CUPreviewBridgeResize *)operation error:(NSError *)error{
  if(_resize!=operation||_closed)return;
  operation.failure=error;[_producer failPresentationSizeRequest:operation.requestToken failure:error error:NULL];
  [self reportFailure:error phase:@"resize"];
  [self finishDisplayCommands:error];
}
- (void)preparePendingResize{
  CUPreviewBridgeResize *operation=_resize;
  if(!operation||operation.failure||_closed||_closing||!_published||_channelFailure||![operation.stage isEqual:@"waiting-for-publish"])return;
  NSError *error;operation.fence=[_producer createFence];
  if(!operation.fence){[self failResize:operation error:CUBridgeError(7,@"The native context cannot create the required resize fence.")];return;}
  operation.sendRight=[CUMachSendRight retainedSendRightWithPort:operation.fence.port error:&error];
  if(!operation.sendRight){[self failResize:operation error:error?:CUBridgeError(7,@"The native resize fence send right could not be copied.")];return;}
  NSMutableDictionary *metadata=[[self wireIdentity]mutableCopy];metadata[@"operationID"]=@(operation.operationID);metadata[@"kind"]=@"resize";metadata[@"expectedContextID"]=@(_producer.contextID);metadata[@"contextID"]=@(_producer.contextID);metadata[@"width"]=@(operation.size.width);metadata[@"height"]=@(operation.size.height);
  operation.stage=@"prepare-in-flight";__weak CUPreviewBridge *weak=self;
  [_channel sendRequestOperation:@"prepareOperation" metadata:metadata sendRight:operation.sendRight timeout:30 completion:^(NSDictionary *reply,CUMachSendRight *right,NSError *transportError){
    (void)right;CUPreviewBridge *owner=weak;if(!owner||owner.isClosed||owner->_resize!=operation||owner->_closing)return;
    NSError *failure=[owner replyFailure:reply flag:@"prepared" error:transportError];
    for(NSString *key in @[@"operationID",@"kind",@"contextID",@"width",@"height"]){if(!failure&&![reply[key]isEqual:metadata[key]])failure=CUBridgeError(5,@"The host prepare reply does not match the pending resize operation.");}
    if(failure){[owner failResize:operation error:failure];return;}
    operation.stage=@"prepared";
    if(![owner.producer markPresentationSizeRequestPrepared:operation.requestToken fence:operation.fence error:&failure]||![owner.producer applyPresentationSize:operation.size requestToken:operation.requestToken preparedFence:operation.fence error:&failure]){[owner failResize:operation error:failure?:CUBridgeError(7,@"The native point-size commit failed after host prepare.")];return;}
    operation.stage=@"complete-in-flight";
    [owner->_channel sendRequestOperation:@"completeOperation" metadata:metadata sendRight:nil timeout:30 completion:^(NSDictionary *completeReply,CUMachSendRight *unused,NSError *completeError){
      (void)unused;CUPreviewBridge *current=weak;if(!current||current.isClosed||current->_resize!=operation||current->_closing)return;
      NSError *completeFailure=[current replyFailure:completeReply flag:@"completed" error:completeError];
      if(!completeFailure&&![completeReply[@"operationID"]isEqual:metadata[@"operationID"]])completeFailure=CUBridgeError(5,@"The host completion reply does not match the committed size operation.");
      if(completeFailure){[current failResize:operation error:completeFailure];return;}
      current->_lastCompletedOperationID=operation.operationID;current->_resize=nil;
      if(![current.producer completePresentationSizeRequest:operation.requestToken error:&completeFailure]){
        current->_resize=operation;operation.stage=@"host-completed-source-pending";[current failResize:operation error:completeFailure?:CUBridgeError(7,@"The source could not finish its acknowledged size request.")];return;
      }
      [current notifyType:@"state" parameters:[current snapshot]];
      [current finishDisplayCommands:nil];
    }];
  }];
}

- (void)receiveEncodedFrame:(NSDictionary *)frame reply:(CUPreviewFrameReply)reply{
  if(_closed||_closing||!_published||_pendingFrameReply){reply(CUBridgeError(8,@"The native frame cannot enter the current presentation delivery slot."));return;}
  if(![frame[@"presentationID"]isEqual:self.identity[@"presentationID"]]||![frame[@"threadID"]isEqual:self.identity[@"threadID"]]||!CUBridgeString(frame[@"codec"])||![frame[@"videoData"]isKindOfClass:NSData.class]||!CUBridgeUnsigned(frame[@"timestamp"],UINT64_MAX,0)||!CUBridgeBoolean(frame[@"isKeyFrame"])||(![frame[@"decoderConfiguration"]isKindOfClass:NSData.class]&&frame[@"decoderConfiguration"]!=NSNull.null)){
    reply(CUBridgeError(8,@"The native encoder returned an invalid frame identity or copied byte payload."));return;
  }
  if(_frameSequence==UINT64_MAX){reply(CUBridgeError(8,@"The native frame sequence is exhausted."));return;}
  NSMutableDictionary *metadata=[[self wireIdentity]mutableCopy];metadata[@"contextID"]=@(_producer.contextID);metadata[@"frameToken"]=NSUUID.UUID.UUIDString;metadata[@"frameId"]=[NSString stringWithFormat:@"%llu",(unsigned long long)++_frameSequence];
  _pendingFrameIdentity=[metadata copy];_pendingFrameReply=[reply copy];
  metadata[@"codec"]=frame[@"codec"];metadata[@"decoderConfiguration"]=[frame[@"decoderConfiguration"]isKindOfClass:NSData.class]?[frame[@"decoderConfiguration"]base64EncodedStringWithOptions:0]:NSNull.null;
  metadata[@"videoData"]=[frame[@"videoData"]base64EncodedStringWithOptions:0];metadata[@"isKeyFrame"]=frame[@"isKeyFrame"];
  metadata[@"timestampNanoseconds"]=[NSString stringWithFormat:@"%llu",[frame[@"timestamp"]unsignedLongLongValue]];
  [self notifyType:@"encoded-frame" parameters:metadata];
}
- (void)acknowledgeEncodedFrame:(NSDictionary *)acknowledgement completion:(CUPreviewBridgeCompletion)completion{
  CUBridgeOnMain(^{
    if(!self->_pendingFrameReply||![self matchesIdentity:acknowledgement]||![acknowledgement[@"frameToken"]isEqual:self->_pendingFrameIdentity[@"frameToken"]]||![acknowledgement[@"frameId"]isEqual:self->_pendingFrameIdentity[@"frameId"]]||!CUBridgeBoolean(acknowledgement[@"success"])){
      completion(nil,CUBridgeError(8,@"The frame reply does not match the single in-flight native delivery."));return;
    }
    NSError *failure;
    if(![acknowledgement[@"success"]boolValue]){
      NSDictionary *detail=acknowledgement[@"error"];
      NSString *message=[detail isKindOfClass:NSDictionary.class]&&CUBridgeString(detail[@"message"])?detail[@"message"]:@"The host frame RPC failed.";
      failure=CUBridgeError(8,message);
    }
    CUPreviewFrameReply reply=self->_pendingFrameReply;self->_pendingFrameReply=nil;self->_pendingFrameIdentity=nil;reply(failure);
    if(failure)[self reportFailure:failure phase:@"frame"];
    [self finishVideoEnableCommands:failure];
    completion([self snapshot],nil);
  });
}
- (void)performCommand:(NSString *)command arguments:(NSDictionary *)arguments completion:(CUPreviewBridgeCompletion)completion{
  CUBridgeOnMain(^{
    if(self->_closed||self->_closing){completion(nil,CUBridgeError(4,@"The native source is closing or closed."));return;}
    if(![self matchesIdentity:arguments]){completion(nil,CUBridgeError(3,@"The native command belongs to a different source binding."));return;}
    NSError *error;BOOL success=NO;
    if([command isEqual:@"setMaximumPixelDimension"]){id value=arguments[@"maximumPixelDimension"];if([value isKindOfClass:NSNumber.class])success=[self.producer setMaximumPixelDimension:[value doubleValue] error:&error];}
    else if([command isEqual:@"setAssociatedWindowIDs"]){success=CUUpdatePreviewAssociatedWindowIDs(self->_session,arguments[@"associatedWindowIDs"],&error);}
    else if([command isEqual:@"setMaximumDisplaySize"]){
      id value=arguments[@"maximumDisplaySize"];
      if([value isKindOfClass:NSNumber.class]&&self->_published&&!self->_channelFailure)success=[self.producer setMaximumDisplaySize:[value doubleValue] error:&error];
      if(success){
        if(self->_resize.failure){completion(nil,self->_resize.failure);return;}
        if(self->_resize||[[self.producer snapshot][@"presentationResizePending"]boolValue]){
          CUPreviewBridgeCommand *pending=[CUPreviewBridgeCommand new];pending.completion=completion;[self->_displayCompletions addObject:pending];__weak CUPreviewBridge *weak=self;
          dispatch_after(dispatch_time(DISPATCH_TIME_NOW,65*NSEC_PER_SEC),dispatch_get_main_queue(),^{
            CUPreviewBridge *owner=weak;if(!owner||![owner->_displayCompletions containsObject:pending])return;
            [owner->_displayCompletions removeObject:pending];pending.completion(nil,CUBridgeError(11,@"The native display-size operation is still pending at its command deadline."));
          });
          return;
        }
      }
    }
    else if([command isEqual:@"setVideoEnabled"]){
      id value=arguments[@"enabled"];
      if(CUBridgeBoolean(value)&&self->_published&&!self->_channelFailure){
        BOOL enabled=[value boolValue];
        if(enabled&&self->_pendingFrameReply){
          CUPreviewBridgeCommand *pending=[CUPreviewBridgeCommand new];pending.completion=completion;[self->_videoEnableCompletions addObject:pending];__weak CUPreviewBridge *weak=self;
          dispatch_after(dispatch_time(DISPATCH_TIME_NOW,65*NSEC_PER_SEC),dispatch_get_main_queue(),^{
            CUPreviewBridge *owner=weak;if(!owner||![owner->_videoEnableCompletions containsObject:pending])return;
            [owner->_videoEnableCompletions removeObject:pending];pending.completion(nil,CUBridgeError(11,@"The previous native frame RPC has not completed before video restart's deadline."));
          });
          return;
        }
        if(!enabled)[self finishVideoEnableCommands:CUBridgeError(4,@"The pending native video start was superseded by a stop.")];
        [self.producer setVideoEnabled:enabled];success=YES;
        if([[[self.producer snapshot]objectForKey:@"videoEnabled"]boolValue]!=enabled){success=NO;error=CUBridgeError(8,@"The native encoder could not enter the requested video-delivery state.");}
      }
    }
    else if([command isEqual:@"snapshot"]){success=YES;}
    else {error=CUBridgeError(2,@"The native source command is not supported.");}
    completion(success?[self snapshot]:nil,success?nil:error?:CUBridgeError(2,@"The native source command requires valid values and a published connection."));
  });
}
- (void)finishDisplayCommands:(NSError *)error{
  if(!error&&(_resize||[[_producer snapshot][@"presentationResizePending"]boolValue]))return;
  NSArray<CUPreviewBridgeCommand *> *commands=[_displayCompletions copy];[_displayCompletions removeAllObjects];NSDictionary *result=error?nil:[self snapshot];
  for(CUPreviewBridgeCommand *command in commands)command.completion(result,error);
}
- (void)finishVideoEnableCommands:(NSError *)error{
  if(!_videoEnableCompletions.count||(!error&&_pendingFrameReply))return;
  if(!error){
    if(_closed||_closing||_channelFailure)error=_channelFailure?:CUBridgeError(4,@"The native video source is no longer available.");
    else {
      [_producer setVideoEnabled:YES];
      if(![[_producer snapshot][@"videoEnabled"]boolValue])error=CUBridgeError(8,@"The native encoder could not resume video delivery.");
    }
  }
  NSArray<CUPreviewBridgeCommand *> *commands=[_videoEnableCompletions copy];[_videoEnableCompletions removeAllObjects];NSDictionary *result=error?nil:[self snapshot];
  for(CUPreviewBridgeCommand *command in commands)command.completion(result,error);
}

- (void)finishClose:(NSError *)error{
  _closeDeadlineToken++;
  NSArray *completions=[_closeCompletions copy];[_closeCompletions removeAllObjects];NSDictionary *result=error?nil:[self snapshot];
  for(CUPreviewBridgeCompletion completion in completions)completion(result,error);
}
- (void)closeWithCompletion:(CUPreviewBridgeCompletion)completion{
  CUBridgeOnMain(^{
    if(self->_closed){completion([self snapshot],nil);return;}
    if(!self->_closeCompletions.count){
      NSUInteger deadlineToken=++self->_closeDeadlineToken;__weak CUPreviewBridge *weak=self;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW,95*NSEC_PER_SEC),dispatch_get_main_queue(),^{
        CUPreviewBridge *owner=weak;if(!owner||owner.isClosed||owner->_closeDeadlineToken!=deadlineToken||!owner->_closeCompletions.count)return;
        NSError *error=CUBridgeError(11,@"The native presentation stop and host detach have not both completed before the close deadline.");
        [owner reportFailure:error phase:@"close-deadline"];[owner finishClose:error];
      });
    }
    [self->_closeCompletions addObject:[completion copy]];
    if(!self->_closing){self->_closing=YES;[self.producer stopVideoDelivery];NSError *error=CUBridgeError(4,@"The native presentation ended before its pending source operations completed.");[self finishStart:error];[self finishDisplayCommands:error];[self finishVideoEnableCommands:error];}
    [self stopCaptureForClose];
  });
}
- (void)stopCaptureForClose{
  if(_closed||!_closing)return;
  if(_captureStopped){if(_detachConfirmed||_providerDestroyed)[self finalizeDetach];else [self requestHostEnd];return;}
  if(_captureStopInFlight)return;
  CUSession *session=_session;
  if(!session){NSError *error=CUBridgeError(9,@"The capture owner disappeared without a completed native stop.");[self reportFailure:error phase:@"capture-stop"];[self finishClose:error];return;}
  _captureStopInFlight=YES;__weak CUPreviewBridge *weak=self;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
    BOOL stopped=NO;NSError *failure;
    @try{stopped=CUStopPreview(session);}@catch(NSException *exception){failure=CUBridgeError(9,exception.reason?:@"The native capture stop failed.");}
    dispatch_async(dispatch_get_main_queue(),^{
      CUPreviewBridge *owner=weak;if(!owner||owner.isClosed)return;owner->_captureStopInFlight=NO;
      if(!stopped){NSError *error=failure?:CUBridgeError(9,@"The native capture is still stopping; the producer remains attached.");[owner reportFailure:error phase:@"capture-stop"];[owner finishClose:error];return;}
      owner->_captureStopped=YES;
      if(owner->_detachConfirmed||owner->_providerDestroyed)[owner finalizeDetach];else [owner requestHostEnd];
    });
  });
}
- (void)requestHostEnd{
  if(_closed||!_closing||!_captureStopped||_publishInFlight||_endRequestInFlight)return;
  if(_detachConfirmed||_providerDestroyed){[self finalizeDetach];return;}
  if(_endAccepted){[self requestHostDetach];return;}
  if(_channelFailure){[self finishClose:_channelFailure];return;}
  if(!_started){
    _started=YES;__weak CUPreviewBridge *weak=self;
    [_channel startWithCompletion:^(NSError *error){CUPreviewBridge *owner=weak;if(!owner||owner.isClosed)return;if(error){owner->_channelFailure=error;[owner reportFailure:error phase:@"channel-start"];[owner finishClose:error];return;}owner->_channelReady=YES;[owner requestHostEnd];}];return;
  }
  if(!_channelReady)return;
  _endRequestInFlight=YES;__weak CUPreviewBridge *weak=self;
  [_channel sendRequestOperation:@"willEndStream" metadata:[self wireIdentity] sendRight:nil timeout:30 completion:^(NSDictionary *reply,CUMachSendRight *right,NSError *error){
    (void)right;CUPreviewBridge *owner=weak;if(!owner||owner.isClosed)return;owner->_endRequestInFlight=NO;
    NSError *failure=[owner replyFailure:reply flag:@"accepted" error:error];
    if(failure){[owner reportFailure:failure phase:@"will-end"];[owner finishClose:failure];return;}
    owner->_endAccepted=YES;[owner requestHostDetach];
  }];
}
- (void)requestHostDetach{
  if(_closed||!_endAccepted||_detachRequestInFlight)return;
  if(_channelFailure){[self finishClose:_channelFailure];return;}
  _detachRequestInFlight=YES;__weak CUPreviewBridge *weak=self;
  [_channel sendRequestOperation:@"sourceDidEndStream" metadata:[self wireIdentity] sendRight:nil timeout:60 completion:^(NSDictionary *reply,CUMachSendRight *right,NSError *error){
    (void)right;CUPreviewBridge *owner=weak;if(!owner||owner.isClosed)return;owner->_detachRequestInFlight=NO;
    NSError *failure=[owner replyFailure:reply flag:@"detached" error:error];
    if(failure){[owner reportFailure:failure phase:@"did-end"];[owner finishClose:failure];return;}
    owner->_detachConfirmed=YES;[owner finalizeDetach];
  }];
}
- (void)confirmProviderDestroyedWithProof:(NSDictionary *)proof completion:(CUPreviewBridgeCompletion)completion{
  CUBridgeOnMain(^{
    if(![proof isKindOfClass:NSDictionary.class]){completion(nil,CUBridgeError(10,@"A trusted provider destruction receipt must be a dictionary."));return;}
    NSDictionary *endpoint=proof[@"hostEndpoint"];
    if(![self matchesIdentity:proof]||!CUBridgeBoolean(proof[@"providerDestroyed"])||![proof[@"providerDestroyed"]boolValue]||![endpoint isKindOfClass:NSDictionary.class]){completion(nil,CUBridgeError(10,@"The provider destruction receipt does not match this native source binding."));return;}
    for(NSString *key in @[@"name",@"nonce",@"pid",@"pidVersion",@"euid"]){if(![endpoint[key]isEqual:self->_hostEndpoint[key]]){completion(nil,CUBridgeError(10,@"The provider destruction receipt belongs to another trusted endpoint."));return;}}
    self->_providerDestroyed=YES;
    [self closeWithCompletion:completion];
  });
}
- (void)finalizeDetach{
  if(_closed||!_closing||!_captureStopped||(!_detachConfirmed&&!_providerDestroyed))return;
  // Both the source stop and host detach (or trusted provider destruction)
  // are confirmed before releasing the context or its outstanding fences.
  [_producer invalidate];CUUnbindPreviewProducer(_session,_producer);_resize=nil;
  _pendingFrameReply=nil;_pendingFrameIdentity=nil;_published=NO;_closed=YES;[_channel close];
  [self finishClose:nil];[self notifyType:@"source-ended" parameters:[self snapshot]];
}
- (NSDictionary *)snapshot{
  NSAssert(NSThread.isMainThread,@"Native presentation snapshots belong to the owner main thread.");
  NSMutableDictionary *value=[[self wireIdentity]mutableCopy];
  value[@"state"]=_closed?@"closed":_closing?@"ending":_published?@"published":_publishRequestSent?@"publishing":_started?@"waiting-for-source":@"created";
  value[@"published"]=@(_published);value[@"closed"]=@(_closed);value[@"captureStopped"]=@(_captureStopped);value[@"endAccepted"]=@(_endAccepted);value[@"hostDetached"]=@(_detachConfirmed);value[@"providerDestroyed"]=@(_providerDestroyed);value[@"cleanupPending"]=@(_closing&&!_closed);
  value[@"lastCompletedOperationID"]=@(_lastCompletedOperationID);value[@"nativeProducer"]=[_producer snapshot];value[@"frameInFlight"]=@(_pendingFrameReply!=nil);value[@"failure"]=_lastFailure.localizedDescription?:NSNull.null;
  NSDictionary *source=CUPreviewSourceIdentity(_session,NULL);if(source&&[source[@"captureId"]isEqual:self.identity[@"captureId"]])value[@"captureSource"]=source;
  if(_resize)value[@"pendingOperation"]=@{@"operationID":@(_resize.operationID),@"requestToken":@(_resize.requestToken),@"kind":@"resize",@"width":@(_resize.size.width),@"height":@(_resize.size.height),@"stage":_resize.stage?:@"waiting",@"failure":_resize.failure.localizedDescription?:NSNull.null};
  return [value copy];
}
@end
