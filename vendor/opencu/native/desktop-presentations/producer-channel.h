#pragma once

#import <Foundation/Foundation.h>
#import "../transport/CUMachChannel.h"

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSErrorDomain const OPProducerChannelErrorDomain;

// Runs synchronously on main. The right is borrowed and must not be consumed.
// Operations: publishRemotePresentation, prepareOperation, completeOperation,
// removePresentation. Payloads contain the immutable nested source identity.
typedef NSDictionary<NSString *, id> * _Nullable (^OPProducerOperationHandler)(
    NSString *operation, NSDictionary<NSString *, id> *payload,
    CUMachSendRight * _Nullable sendRight);
typedef void (^OPProducerChannelErrorHandler)(NSError *error);
typedef void (^OPProducerChannelStartCompletion)(
    NSDictionary<NSString *, id> * _Nullable hostEndpoint, NSError * _Nullable error);

// Owner-main-thread adapter. Construction never starts IPC or creates a surface.
@interface OPProducerChannel : NSObject
@property(nonatomic, readonly, copy) NSDictionary<NSString *, id> *identity;
@property(nonatomic, readonly, copy) NSDictionary<NSString *, id> *sourceIdentity;
@property(nonatomic, readonly, copy, nullable) NSString *bridgeSessionId;
@property(nonatomic, readonly) uint32_t currentContextID;
@property(nonatomic, readonly, getter=isLive) BOOL live;
@property(nonatomic, readonly, getter=isClosed) BOOL closed;

// expectedProducer is the real helper {pid,euid,pidVersion}; identity includes
// presentation/thread/turn/generation/target/view/capture/process/window fields.
- (nullable instancetype)initWithIdentity:(NSDictionary<NSString *, id> *)identity
                        expectedProducer:(NSDictionary<NSString *, NSNumber *> *)expectedProducer
                        operationHandler:(OPProducerOperationHandler)operationHandler
                            errorHandler:(nullable OPProducerChannelErrorHandler)errorHandler
                                   error:(NSError **)error NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

// Endpoint {name,nonce,pid,euid,pidVersion} is private trusted-launch material.
- (void)startWithCompletion:(OPProducerChannelStartCompletion)completion;
- (BOOL)matchesIdentity:(NSDictionary<NSString *, id> *)payload;
- (BOOL)validateFrameIdentity:(NSDictionary<NSString *, id> *)frame;

// Call synchronously after actual attachment detach/CA flush, never after an ACK
// of the remove request. Accepts the native event's identity/source representation.
- (BOOL)confirmSurfaceDetached:(NSDictionary<NSString *, id> *)eventPayload;
// Host has really released all its surfaces; carrier closure alone is not proof.
- (void)confirmHostReleased;
// DSH fault recovery, not a Codex protocol operation. Main-thread only. A
// pre-armed, identity-checked kernel NOTE_EXIT is required before native removal.
// Returns nil/error without exit proof; otherwise returns the current snapshot.
// A pending snapshot is not surface proof. Repeated calls never repeat removal.
- (nullable NSDictionary<NSString *, id> *)retireExitedProducer:(NSError **)error;
// Only an unused, unbound reservation can be cancelled without producer teardown.
- (BOOL)cancelReservation:(NSError **)error;
// Enqueues transport close after any replies already enqueued by this adapter.
- (void)closeCarrier;
// Owner-main snapshot deliberately omits endpoint nonce and private channel token.
- (NSDictionary<NSString *, id> *)snapshot;
@end

NS_ASSUME_NONNULL_END
