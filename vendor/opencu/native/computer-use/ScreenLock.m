#import "ScreenLock.h"
#import <Cocoa/Cocoa.h>
#import <math.h>

NSString *const CUScreenLockErrorDomain = @"ai.trisoul.computer-use.screen-lock";
const NSTimeInterval CUScreenLockAuthorizationTimeout = 10;
const NSTimeInterval CUScreenLockPollInterval = 0.25;
const NSTimeInterval CUScreenLockSubmitDelay = 0.5;
const NSTimeInterval CUScreenLockVerificationDelay = 2;
const NSTimeInterval CUScreenLockUISettleDelay = 1.5;
const NSTimeInterval CUScreenLockUIFallbackDelay = 3;

static NSError *CUScreenLockError(CUScreenLockErrorCode code, NSString *message) {
  return [NSError errorWithDomain:CUScreenLockErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey:message}];
}

static void CUWithQueue(dispatch_queue_t queue, const void *key, dispatch_block_t work) {
  if (dispatch_get_specific(key)) work(); else dispatch_sync(queue, work);
}

@interface CULoginAuthorizationAttempt ()
@property dispatch_queue_t queue;
@property (copy) void (^ended)(CULoginAuthorizationAttempt *);
@property NSMutableArray<void (^)(CULoginAuthorizationResolution)> *waiters;
@property CULoginAuthorizationResolution storedResolution;
- (instancetype)initWithQueue:(dispatch_queue_t)queue ended:(void (^)(CULoginAuthorizationAttempt *))ended;
- (BOOL)resolve:(CULoginAuthorizationResolution)resolution;
@end

@implementation CULoginAuthorizationAttempt
- (instancetype)initWithQueue:(dispatch_queue_t)queue ended:(void (^)(CULoginAuthorizationAttempt *))ended {
  if ((self = [super init])) { _queue=queue;_ended=[ended copy];_storedResolution=CULoginAuthorizationPending;_waiters=[NSMutableArray new]; }
  return self;
}
- (CULoginAuthorizationResolution)resolution {
  __block CULoginAuthorizationResolution result;
  CUWithQueue(self.queue, (__bridge const void *)self.queue, ^{result=self.storedResolution;});
  return result;
}
- (BOOL)resolve:(CULoginAuthorizationResolution)resolution {
  __block BOOL changed=NO;
  CUWithQueue(self.queue, (__bridge const void *)self.queue, ^{
    if (self.storedResolution!=CULoginAuthorizationPending || resolution==CULoginAuthorizationPending) return;
    self.storedResolution=resolution;changed=YES;
    void (^ended)(CULoginAuthorizationAttempt *)=self.ended;self.ended=nil;
    if(ended)ended(self);
    NSArray *waiters=[self.waiters copy];[self.waiters removeAllObjects];
    for(void (^waiter)(CULoginAuthorizationResolution) in waiters)waiter(resolution);
  });
  return changed;
}
- (void)revoke { [self resolve:CULoginAuthorizationRevoked]; }
- (void)waitForResolutionWithTimeout:(NSTimeInterval)timeout completion:(void (^)(CULoginAuthorizationResolution))completion {
  dispatch_async(self.queue, ^{
    if(self.storedResolution!=CULoginAuthorizationPending){completion(self.storedResolution);return;}
    [self.waiters addObject:[completion copy]];
    __weak CULoginAuthorizationAttempt *attempt=self;
    NSTimeInterval bounded=isfinite(timeout)?MAX(0,MIN(timeout,86400)):0;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)(bounded*NSEC_PER_SEC)),self.queue,^{[attempt resolve:CULoginAuthorizationExpired];});
  });
}
@end

@interface CULoginAuthorizationBroker ()
@property dispatch_queue_t queue;
@property CULoginAuthorizationAttempt *activeAttempt;
@end

@implementation CULoginAuthorizationBroker
- (instancetype)init {
  if((self=[super init])){_queue=dispatch_queue_create("ai.trisoul.computer-use.login-authorization",DISPATCH_QUEUE_SERIAL);dispatch_queue_set_specific(_queue,(__bridge const void *)_queue,(void *)1,NULL);}
  return self;
}
- (CULoginAuthorizationAttempt *)beginLoginAuthorizationAttempt {
  __block CULoginAuthorizationAttempt *attempt;
  CUWithQueue(self.queue,(__bridge const void *)self.queue,^{
    __weak CULoginAuthorizationBroker *broker=self;
    attempt=[[CULoginAuthorizationAttempt alloc]initWithQueue:self.queue ended:^(CULoginAuthorizationAttempt *finished){
      CULoginAuthorizationBroker *live=broker;if(live.activeAttempt==finished)live.activeAttempt=nil;
    }];
    [self.activeAttempt revoke];self.activeAttempt=attempt;
  });
  return attempt;
}
- (BOOL)consumePendingLoginAuthorizationAttempt {
  __block BOOL consumed=NO;
  CUWithQueue(self.queue,(__bridge const void *)self.queue,^{CULoginAuthorizationAttempt *attempt=self.activeAttempt;consumed=attempt&&[attempt resolve:CULoginAuthorizationConsumed];});
  return consumed;
}
- (void)revokePendingLoginAuthorizationAttempt { CUWithQueue(self.queue,(__bridge const void *)self.queue,^{[self.activeAttempt revoke];}); }
- (NSDictionary *)snapshot {
  __block NSDictionary *state;
  CUWithQueue(self.queue,(__bridge const void *)self.queue,^{state=@{@"pending":@(self.activeAttempt!=nil),@"resolution":self.activeAttempt?@(self.activeAttempt.storedResolution):NSNull.null};});
  return state;
}
@end

@implementation CUScreenLockController
- (NSNumber *)readLockedStateWithError:(NSError **)error {
  CFDictionaryRef current=CGSessionCopyCurrentDictionary();
  if(!current){if(error)*error=CUScreenLockError(CUScreenLockStateUnavailable,@"CGSession current state is unavailable.");return nil;}
  id value=[(__bridge NSDictionary *)current objectForKey:@"CGSSessionScreenIsLocked"];
  NSNumber *result=nil;
  // The public controller treats an absent lock field in the current session as false.
  if(!value)result=@NO;
  else if([value isKindOfClass:NSNumber.class])result=@([value boolValue]);
  else if(error)*error=CUScreenLockError(CUScreenLockStateUnavailable,@"CGSession screen-lock state has an unexpected type.");
  CFRelease(current);return result;
}
- (BOOL)isScreenLocked { return [[self readLockedStateWithError:NULL]boolValue]; }
- (NSDictionary *)snapshot {
  NSError *error=nil;NSNumber *locked=[self readLockedStateWithError:&error];
  return @{@"available":@(locked!=nil),@"locked":locked?:@NO,@"source":@"CGSessionCopyCurrentDictionary.CGSSessionScreenIsLocked",@"error":error.localizedDescription?:NSNull.null};
}
- (void)requestRelockWithCompletion:(void (^)(NSError *))completion {
  if(!AXIsProcessTrusted()||!CGPreflightPostEventAccess()){completion(CUScreenLockError(CUScreenLockPermissionDenied,@"The native helper lacks permission to post screen-lock events."));return;}
  // Original controller: source state 1, keys 55/59/12 down then 12/59/55 up at session tap.
  CGEventSourceRef source=CGEventSourceCreate((CGEventSourceStateID)1);
  CGKeyCode keys[]={55,59,12,12,59,55};
  CGEventFlags flags[]={0x100000,0x140000,0x140000,0x140000,0x100000,0};
  CGEventRef events[6]={NULL};
  BOOL complete=source!=NULL;
  for(NSUInteger i=0;i<6&&complete;i++){events[i]=CGEventCreateKeyboardEvent(source,keys[i],i<3);complete=events[i]!=NULL;if(events[i])CGEventSetFlags(events[i],flags[i]);}
  if(complete)for(NSUInteger i=0;i<6;i++)CGEventPost(kCGSessionEventTap,events[i]);
  for(NSUInteger i=0;i<6;i++)if(events[i])CFRelease(events[i]);
  if(source)CFRelease(source);
  completion(complete?nil:CUScreenLockError(CUScreenLockUnavailable,@"Unable to create the complete screen-lock event sequence."));
}
@end

@interface CUScreenLockRequest : NSObject
@property NSString *threadID;
@property NSString *ownerID;
@property NSString *key;
@property (copy) void (^completion)(BOOL,NSError *);
@property CULoginAuthorizationAttempt *attempt;
@property id<CUScreenLockInputOperation> operation;
@property BOOL cancelled;
@property (copy) BOOL (^isCancelled)(void);
@property BOOL finished;
@property BOOL drained;
@property NSMutableArray<dispatch_block_t> *drainCompletions;
@property NSUInteger operationOrdinal;
@end
@implementation CUScreenLockRequest
@end

@interface CUScreenLockCoordinator ()
@property dispatch_queue_t queue;
@property CUScreenLockController *controller;
@property CULoginAuthorizationBroker *broker;
@property id<CUScreenLockAuthorizedProvider> provider;
@property (copy) BOOL (^enabled)(void);
@property NSMutableDictionary<NSString *,NSDictionary *> *activeOwners;
@property NSMutableDictionary<NSString *,NSDictionary *> *autoUnlockedOwners;
@property NSMutableDictionary<NSString *,NSDictionary *> *guardianLeaseOwners;
@property NSMutableDictionary<NSString *,CUScreenLockRequest *> *pendingGuards;
@property NSMutableArray<CUScreenLockRequest *> *waitingRequests;
@property NSMutableArray<void (^)(NSError *)> *settlingCompletions;
@property NSMutableSet<NSString *> *cleanupRequiredOwners;
@property NSArray<NSString *> *lastPhysicalOwners;
@property id<CUScreenLockCancellation> physicalMonitor;
@property id<CUScreenLockCancellation> activeOverlayAssertion;
@property id<CUScreenLockCancellation> settlingOverlayAssertion;
@property id<CUScreenLockCancellation> settlingObservation;
@property CUScreenLockRequest *runningRequest;
@property NSUInteger attemptsInLockedEpisode;
@property uint8_t suppressionByte;
@property NSUInteger settlingGeneration;
@property NSError *lastError;
@end

@implementation CUScreenLockCoordinator
- (instancetype)initWithController:(CUScreenLockController *)controller broker:(CULoginAuthorizationBroker *)broker provider:(id<CUScreenLockAuthorizedProvider>)provider enabled:(BOOL (^)(void))enabled {
  if((self=[super init])){
    _controller=controller;_broker=broker;_provider=provider;_enabled=[enabled copy];
    _queue=dispatch_queue_create("ai.trisoul.computer-use.screen-lock",DISPATCH_QUEUE_SERIAL);dispatch_queue_set_specific(_queue,(__bridge const void *)_queue,(void *)1,NULL);
    _activeOwners=[NSMutableDictionary new];_autoUnlockedOwners=[NSMutableDictionary new];_guardianLeaseOwners=[NSMutableDictionary new];_pendingGuards=[NSMutableDictionary new];_waitingRequests=[NSMutableArray new];_settlingCompletions=[NSMutableArray new];_cleanupRequiredOwners=[NSMutableSet new];_lastPhysicalOwners=@[];
  }
  return self;
}
- (NSString *)keyForThread:(NSString *)thread owner:(NSString *)owner { return [NSString stringWithFormat:@"%lu:%@%@",(unsigned long)owner.length,owner,thread]; }
- (void)updateLockedEpisode:(BOOL)locked {
  if(!locked){self.attemptsInLockedEpisode=0;if(self.suppressionByte==2)self.suppressionByte=0;}
  else if(self.suppressionByte==1)self.suppressionByte=2;
}
- (void)releaseActiveResourcesIfUnused {
  if(self.pendingGuards.count||self.guardianLeaseOwners.count)return;
  [self.physicalMonitor cancel];self.physicalMonitor=nil;
  [self.activeOverlayAssertion cancel];self.activeOverlayAssertion=nil;
}
- (BOOL)beginGuard:(CUScreenLockRequest *)request error:(NSError **)error {
  if(!self.provider){if(error)*error=CUScreenLockError(CUScreenLockUnavailable,@"privilegedGuardianUnavailable: an installed authorized screen-unlock provider is required.");return NO;}
  if(!self.physicalMonitor){
    __weak CUScreenLockCoordinator *coordinator=self;
    self.physicalMonitor=[self.provider startPhysicalInputMonitoring:^{[coordinator handlePhysicalUserInteraction];}error:error];
    if(!self.physicalMonitor){if(error&&!*error)*error=CUScreenLockError(CUScreenLockUnavailable,@"Physical-input monitoring is unavailable.");return NO;}
  }
  if(!self.activeOverlayAssertion){
    self.activeOverlayAssertion=[self.provider acquireOverlayAssertionWithError:error];
    if(!self.activeOverlayAssertion){[self releaseActiveResourcesIfUnused];if(error&&!*error)*error=CUScreenLockError(CUScreenLockUnavailable,@"Screen-lock overlay assertion is unavailable.");return NO;}
  }
  self.pendingGuards[request.key]=request;
  if(self.settlingOverlayAssertion){
    self.settlingGeneration++;[self.settlingObservation cancel];self.settlingObservation=nil;
    [self.settlingOverlayAssertion cancel];self.settlingOverlayAssertion=nil;
    // Own-host connection completions must still be delivered when a new guard supersedes settling.
    NSArray *callbacks=[self.settlingCompletions copy];[self.settlingCompletions removeAllObjects];
    for(void (^callback)(NSError *) in callbacks)callback(CUScreenLockError(CUScreenLockCancelled,@"Relock settling was superseded by a new unlock guard."));
  }
  return YES;
}
- (void)completeGuard:(CUScreenLockRequest *)request didUnlock:(BOOL)didUnlock {
  BOOL removed=self.pendingGuards[request.key]==request;
  if(removed)[self.pendingGuards removeObjectForKey:request.key];
  if(removed&&didUnlock&&!request.cancelled)self.guardianLeaseOwners[request.key]=@{@"thread_id":request.threadID,@"owner_id":request.ownerID};
  else [self releaseActiveResourcesIfUnused];
}
- (void)finishRequest:(CUScreenLockRequest *)request didUnlock:(BOOL)didUnlock error:(NSError *)error {
  if(request.finished)return;request.finished=YES;self.lastError=error;
  [request.attempt revoke];request.attempt=nil;
  id<CUScreenLockInputOperation> operation=request.operation;request.operation=nil;
  dispatch_block_t complete=^{
    BOOL cancelled=request.cancelled||request.isCancelled();BOOL result=didUnlock&&!cancelled;
    NSError *failure=cancelled?CUScreenLockError(CUScreenLockCancelled,@"The owning connection ended its unlock request."):error;
    [self completeGuard:request didUnlock:result];
    if(result&&self.guardianLeaseOwners[request.key])self.autoUnlockedOwners[request.key]=self.guardianLeaseOwners[request.key];
    if(self.runningRequest==request)self.runningRequest=nil;
    request.drained=YES;self.lastError=failure;
    void (^completion)(BOOL,NSError *)=request.completion;request.completion=nil;
    if(completion)completion(result,failure);
    NSArray *callbacks=[request.drainCompletions copy];[request.drainCompletions removeAllObjects];
    for(dispatch_block_t callback in callbacks)callback();
    [self runNextRequest];
  };
  if(operation)[operation cancelWithCompletion:^{dispatch_async(self.queue,complete);}];else complete();
}
- (void)waitForRequestsToDrain:(NSArray<CUScreenLockRequest *> *)requests completion:(dispatch_block_t)completion {
  NSMutableArray<CUScreenLockRequest *> *pending=[NSMutableArray new];
  for(CUScreenLockRequest *request in requests)if(!request.drained)[pending addObject:request];
  if(!pending.count){completion();return;}
  __block NSUInteger count=pending.count;
  for(CUScreenLockRequest *request in pending)[request.drainCompletions addObject:^{if(--count==0)completion();}];
}
- (void)performUnlockAttempt:(CUScreenLockRequest *)request {
  if(request.cancelled||request.isCancelled()){[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockCancelled,@"The owning connection ended its unlock guard.")];return;}
  NSError *error=nil;NSNumber *locked=[self.controller readLockedStateWithError:&error];
  if(!locked){[self finishRequest:request didUnlock:NO error:error];return;}
  [self updateLockedEpisode:locked.boolValue];
  if(!locked.boolValue){[self finishRequest:request didUnlock:NO error:nil];return;}
  if(self.suppressionByte){[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockSuppressed,@"Automatic screen unlocking is suppressed after physical interaction.")];return;}
  if(self.attemptsInLockedEpisode>=2){[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockAttemptsExceeded,@"Automatic screen unlocking reached two attempts for this locked episode.")];return;}
  self.attemptsInLockedEpisode++;
  NSUInteger ordinal=++request.operationOrdinal;
  __weak CUScreenLockCoordinator *coordinator=self;
  request.operation=[self.provider unlockWithBroker:self.broker acceptingAttempt:^BOOL(CULoginAuthorizationAttempt *attempt){
    CUScreenLockCoordinator *live=coordinator;if(!live){[attempt revoke];return NO;}
    __block BOOL accepted=NO;CUWithQueue(live.queue,(__bridge const void *)live.queue,^{
      if(!request.finished&&!request.cancelled&&!request.isCancelled()&&request.operationOrdinal==ordinal){request.attempt=attempt;accepted=YES;}else [attempt revoke];
    });return accepted;
  }completion:^(BOOL didUnlock,NSError *providerError){
    CUScreenLockCoordinator *live=coordinator;if(!live)return;
    dispatch_async(live.queue,^{
      if(request.finished||request.operationOrdinal!=ordinal)return;
      CULoginAuthorizationAttempt *attempt=request.attempt;
      BOOL consumed=attempt&&attempt.resolution==CULoginAuthorizationConsumed;
      [attempt revoke];request.attempt=nil;
      if(request.cancelled){[live finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockCancelled,@"The owning connection ended its unlock guard.")];return;}
      NSError *stateError=nil;NSNumber *actual=[live.controller readLockedStateWithError:&stateError];
      if(!actual){[live finishRequest:request didUnlock:NO error:stateError];return;}
      [live updateLockedEpisode:actual.boolValue];
      if(providerError){[live finishRequest:request didUnlock:NO error:providerError];return;}
      if(!didUnlock){if(!actual.boolValue){[live finishRequest:request didUnlock:NO error:nil];return;}[live performUnlockAttempt:request];return;}
      if(!consumed){[live finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockAuthorizationRejected,@"The OS authorization mechanism did not consume this unlock attempt.")];return;}
      if(didUnlock&&!actual.boolValue){[live finishRequest:request didUnlock:YES error:nil];return;}
      if(!actual.boolValue){[live finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockAuthorizationRejected,@"The screen changed without a confirmed automatic unlock.")];return;}
      [live performUnlockAttempt:request];
    });
  }];
  if(!request.operation){[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockUnavailable,@"The provider did not start a cancellable unlock operation.")];return;}
  // Bound a provider failure independently of its callback, and ignore any later result.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,(int64_t)((CUScreenLockAuthorizationTimeout+CUScreenLockSubmitDelay+CUScreenLockVerificationDelay)*NSEC_PER_SEC)),self.queue,^{
    if(!request.finished&&request.operationOrdinal==ordinal)[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockTimedOut,@"The authorized screen-unlock operation timed out.")];
  });
}
- (void)runNextRequest {
  if(self.runningRequest||!self.waitingRequests.count)return;
  CUScreenLockRequest *request=self.waitingRequests.firstObject;[self.waitingRequests removeObjectAtIndex:0];
  if(request.cancelled||request.isCancelled()){[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockCancelled,@"The owning connection ended its request.")];return;}
  NSError *error=nil;NSNumber *locked=[self.controller readLockedStateWithError:&error];
  if(!locked){[self finishRequest:request didUnlock:NO error:error];return;}
  [self updateLockedEpisode:locked.boolValue];
  if(!locked.boolValue){
    if(self.autoUnlockedOwners.count){NSDictionary *lease=@{@"thread_id":request.threadID,@"owner_id":request.ownerID};self.autoUnlockedOwners[request.key]=lease;self.guardianLeaseOwners[request.key]=lease;}
    [self finishRequest:request didUnlock:NO error:nil];return;
  }
  if(!self.enabled()||!request.threadID.length){[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockUnavailable,@"Screen unlocking requires an enabled policy and a trusted thread ID.")];return;}
  if(self.suppressionByte){[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockSuppressed,@"Automatic screen unlocking is suppressed after physical interaction.")];return;}
  if(![self beginGuard:request error:&error]){[self finishRequest:request didUnlock:NO error:error];return;}
  self.runningRequest=request;[self performUnlockAttempt:request];
}
- (void)prepareForRequestForThread:(NSString *)threadID owner:(NSString *)ownerID completion:(void (^)(BOOL,NSError *))completion {
  [self prepareForRequestForThread:threadID owner:ownerID cancelled:^{return NO;} completion:completion];
}
- (void)prepareForRequestForThread:(NSString *)threadID owner:(NSString *)ownerID cancelled:(BOOL (^)(void))cancelled completion:(void (^)(BOOL,NSError *))completion {
  dispatch_async(self.queue,^{
    if(cancelled()){completion(NO,CUScreenLockError(CUScreenLockCancelled,@"The owning connection was cancelled before unlock preparation."));return;}
    if(!ownerID.length){completion(NO,CUScreenLockError(CUScreenLockInvalidOwner,@"A trusted connection owner is required."));return;}
    NSString *thread=threadID?:@"";NSString *key=[self keyForThread:thread owner:ownerID];
    for(CUScreenLockRequest *existing in self.waitingRequests)if([existing.key isEqualToString:key]){completion(NO,CUScreenLockError(CUScreenLockInvalidOwner,@"The connection already has a pending screen-unlock request."));return;}
    if(self.pendingGuards[key]){completion(NO,CUScreenLockError(CUScreenLockInvalidOwner,@"The connection already has a pending unlock guard."));return;}
    CUScreenLockRequest *request=[CUScreenLockRequest new];request.threadID=thread;request.ownerID=ownerID;request.key=key;request.isCancelled=[cancelled copy];request.completion=[completion copy];request.drainCompletions=[NSMutableArray new];
    if(thread.length)self.activeOwners[key]=@{@"thread_id":thread,@"owner_id":ownerID};
    [self.waitingRequests addObject:request];[self runNextRequest];
  });
}
- (void)finishSettling:(NSUInteger)generation error:(NSError *)error {
  if(generation!=self.settlingGeneration)return;
  if(self.guardianLeaseOwners.count||(!self.settlingOverlayAssertion&&!error))return;
  if(!error){NSError *stateError=nil;NSNumber *locked=[self.controller readLockedStateWithError:&stateError];if(!locked)error=stateError;else if(!locked.boolValue)error=CUScreenLockError(CUScreenLockTimedOut,@"The lock UI settled while the screen was still unlocked.");}
  [self.settlingObservation cancel];self.settlingObservation=nil;
  [self.settlingOverlayAssertion cancel];self.settlingOverlayAssertion=nil;
  NSArray *callbacks=[self.settlingCompletions copy];[self.settlingCompletions removeAllObjects];self.lastError=error;
  for(void (^callback)(NSError *) in callbacks)callback(error);
}
- (void)relockIfUnusedWithCompletion:(void (^)(NSError *))completion {
  if(self.pendingGuards.count||self.guardianLeaseOwners.count){if(completion)completion(nil);return;}
  [self.physicalMonitor cancel];self.physicalMonitor=nil;
  NSError *error=nil;NSNumber *locked=[self.controller readLockedStateWithError:&error];
  if(!locked){[self releaseActiveResourcesIfUnused];if(completion)completion(error);return;}
  if(locked.boolValue){
    [self.activeOverlayAssertion cancel];self.activeOverlayAssertion=nil;
    if(self.settlingOverlayAssertion){if(completion)[self.settlingCompletions addObject:[completion copy]];}
    else if(completion)completion(nil);
    return;
  }
  if(completion)[self.settlingCompletions addObject:[completion copy]];
  if(!self.settlingOverlayAssertion){
    self.settlingOverlayAssertion=[self.provider acquireOverlayAssertionWithError:&error];
    if(!self.settlingOverlayAssertion){NSError *resourceError=error?:CUScreenLockError(CUScreenLockUnavailable,@"Relock settling requires an authorized overlay provider.");[self.controller requestRelockWithCompletion:^(NSError *lockError){[self releaseActiveResourcesIfUnused];[self finishSettling:self.settlingGeneration error:lockError?:resourceError];}];return;}
    NSUInteger generation=++self.settlingGeneration;__weak CUScreenLockCoordinator *coordinator=self;
    self.settlingObservation=[self.provider observeLockUISettled:^(NSError *settlingError){CUScreenLockCoordinator *live=coordinator;if(live)dispatch_async(live.queue,^{[live finishSettling:generation error:settlingError];});}error:&error];
    if(!self.settlingObservation){NSError *resourceError=error?:CUScreenLockError(CUScreenLockUnavailable,@"The lock UI settling observation is unavailable.");[self.controller requestRelockWithCompletion:^(NSError *lockError){[self releaseActiveResourcesIfUnused];[self finishSettling:generation error:lockError?:resourceError];}];return;}
  }
  [self.activeOverlayAssertion cancel];self.activeOverlayAssertion=nil;
  [self.controller requestRelockWithCompletion:^(NSError *lockError){if(lockError)[self finishSettling:self.settlingGeneration error:lockError];}];
}
- (void)turnEndedForThread:(NSString *)threadID owner:(NSString *)ownerID {
  dispatch_async(self.queue,^{
    NSString *key=[self keyForThread:threadID owner:ownerID];[self.activeOwners removeObjectForKey:key];
    BOOL removed=self.autoUnlockedOwners[key]!=nil;[self.autoUnlockedOwners removeObjectForKey:key];
    if(removed)[self.guardianLeaseOwners removeObjectForKey:key];
    for(CUScreenLockRequest *request in self.waitingRequests)if([request.key isEqualToString:key])request.cancelled=YES;
    CUScreenLockRequest *guard=self.pendingGuards[key];if(guard){guard.cancelled=YES;[self finishRequest:guard didUnlock:NO error:CUScreenLockError(CUScreenLockCancelled,@"The owning thread ended its unlock guard.")];}
    if(removed||guard){
      [self.cleanupRequiredOwners addObject:ownerID];
      [self waitForRequestsToDrain:guard?@[guard]:@[] completion:^{[self relockIfUnusedWithCompletion:^(NSError *error){if(!error)[self.cleanupRequiredOwners removeObject:ownerID];}];}];
    }
  });
}
- (void)handlePhysicalUserInteraction {
  dispatch_async(self.queue,^{
    BOOL hadPending=self.pendingGuards.count!=0;
    if(!hadPending&&!self.guardianLeaseOwners.count)return;
    NSMutableSet<NSString *> *affectedOwners=[NSMutableSet new];
    for(CUScreenLockRequest *guard in self.pendingGuards.allValues)[affectedOwners addObject:guard.ownerID];
    for(NSDictionary *lease in self.guardianLeaseOwners.allValues)[affectedOwners addObject:lease[@"owner_id"]];
    self.lastPhysicalOwners=[affectedOwners.allObjects sortedArrayUsingSelector:@selector(compare:)];
    NSArray *guards=self.pendingGuards.allValues;[self.guardianLeaseOwners removeAllObjects];
    [self.cleanupRequiredOwners unionSet:affectedOwners];
    // The guardian and automatic coordinator have separate source collections.
    if(self.autoUnlockedOwners.count){[self.autoUnlockedOwners removeAllObjects];self.suppressionByte=1;NSNumber *locked=[self.controller readLockedStateWithError:NULL];if(locked)[self updateLockedEpisode:locked.boolValue];}
    for(CUScreenLockRequest *request in self.waitingRequests)request.cancelled=YES;
    for(CUScreenLockRequest *guard in guards){guard.cancelled=YES;[self finishRequest:guard didUnlock:NO error:CUScreenLockError(CUScreenLockCancelled,@"Physical user input invalidated the screen-unlock guard.")];}
    if(self.physicalInteractionHandler)self.physicalInteractionHandler(hadPending);
    [self waitForRequestsToDrain:guards completion:^{[self relockIfUnusedWithCompletion:^(NSError *error){if(!error)[self.cleanupRequiredOwners minusSet:affectedOwners];}];}];
  });
}
- (void)serviceConnectionInvalidatedForOwner:(NSString *)ownerID completion:(void (^)(NSError *))completion {
  dispatch_async(self.queue,^{
    if(!ownerID.length){completion(CUScreenLockError(CUScreenLockInvalidOwner,@"A trusted connection owner is required for cleanup."));return;}
    BOOL retry=[self.cleanupRequiredOwners containsObject:ownerID];
    BOOL heldLease=NO;
    for(NSString *key in [self.activeOwners.allKeys copy])if([self.activeOwners[key][@"owner_id"]isEqual:ownerID])[self.activeOwners removeObjectForKey:key];
    for(NSString *key in [self.autoUnlockedOwners.allKeys copy])if([self.autoUnlockedOwners[key][@"owner_id"]isEqual:ownerID]){heldLease=YES;[self.autoUnlockedOwners removeObjectForKey:key];}
    for(NSString *key in [self.guardianLeaseOwners.allKeys copy])if([self.guardianLeaseOwners[key][@"owner_id"]isEqual:ownerID]){heldLease=YES;[self.guardianLeaseOwners removeObjectForKey:key];}
    NSMutableArray<CUScreenLockRequest *> *requests=[NSMutableArray new];
    for(CUScreenLockRequest *request in [self.waitingRequests copy])if([request.ownerID isEqual:ownerID]){request.cancelled=YES;[requests addObject:request];[self.waitingRequests removeObject:request];}
    for(CUScreenLockRequest *request in self.pendingGuards.allValues)if([request.ownerID isEqual:ownerID]){heldLease=YES;request.cancelled=YES;[requests addObject:request];}
    if(heldLease||retry)[self.cleanupRequiredOwners addObject:ownerID];
    for(CUScreenLockRequest *request in requests)[self finishRequest:request didUnlock:NO error:CUScreenLockError(CUScreenLockCancelled,@"The owning connection was invalidated.")];
    [self waitForRequestsToDrain:requests completion:^{
      if(retry&&(self.pendingGuards.count||self.guardianLeaseOwners.count)){completion(CUScreenLockError(CUScreenLockCancelled,@"Relock cleanup is deferred while another owner holds a screen-unlock guard or lease."));return;}
      if(heldLease||retry||self.settlingOverlayAssertion){
        [self.cleanupRequiredOwners addObject:ownerID];
        [self relockIfUnusedWithCompletion:^(NSError *error){if(!error)[self.cleanupRequiredOwners removeObject:ownerID];completion(error);}];
      }else completion(nil);
    }];
  });
}
- (NSDictionary *)snapshot {
  __block NSDictionary *state;
  CUWithQueue(self.queue,(__bridge const void *)self.queue,^{
    state=@{@"controller":[self.controller snapshot],@"enabled":@(self.enabled()),@"provider":self.provider?[self.provider capabilities]:@{@"available":@NO,@"reason":@"privilegedGuardianUnavailable"},@"active_owners":self.activeOwners.allValues,@"auto_unlocked_owners":self.autoUnlockedOwners.allValues,@"guardian_lease_owners":self.guardianLeaseOwners.allValues,@"pending_guards":@(self.pendingGuards.count),@"attempts_in_locked_episode":@(self.attemptsInLockedEpisode),@"max_attempts_per_locked_episode":@2,@"suppression_byte":@(self.suppressionByte),@"relock_settling":@(self.settlingOverlayAssertion!=nil),@"last_physical_owners":self.lastPhysicalOwners,@"cleanup_required_owners":[self.cleanupRequiredOwners.allObjects sortedArrayUsingSelector:@selector(compare:)],@"authorization":[self.broker snapshot],@"last_error":self.lastError.localizedDescription?:NSNull.null};
  });return state;
}
@end
