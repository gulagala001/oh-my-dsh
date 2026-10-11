#import <Foundation/Foundation.h>
#import "PreviewProducer.h"

NS_ASSUME_NONNULL_BEGIN

@class CUSession;

FOUNDATION_EXPORT NSString *const CUPreviewBridgeErrorDomain;

typedef void (^CUPreviewBridgeCompletion)(NSDictionary *_Nullable result, NSError *_Nullable error);
// Delivered on the owner main thread. The encoded-frame notification is only
// delivery; acknowledgeEncodedFrame must wait for the actual host frame RPC.
typedef void (^CUPreviewBridgeNotificationHandler)(NSString *method, NSDictionary *parameters);

@interface CUPreviewBridge : NSObject
@property(nonatomic, readonly, copy) NSDictionary *identity;
@property(nonatomic, readonly, copy) NSString *bridgeSessionId;
@property(nonatomic, readonly, strong) CUPreviewProducer *producer;
@property(nonatomic, readonly, getter=isClosed) BOOL closed;

// Main-thread factory. arguments contains the trusted hostEndpoint and actual
// presentation/thread/turn/source-generation/target/view/capture identities.
// This bridge binds only the existing read-only capture; it claims no input.
- (nullable instancetype)initWithSession:(CUSession *)session
                              arguments:(NSDictionary *)arguments
                    notificationHandler:(CUPreviewBridgeNotificationHandler)notificationHandler
                                  error:(NSError **)error;
- (instancetype)init NS_UNAVAILABLE;

// Asynchronous entry points may be called from any queue. Every completion is
// delivered on main; no operation waits synchronously for a host reply.
// Start has a 45-second deadline; close has a 95-second deadline. Deadline
// failure leaves the context and host operation pending for explicit cleanup.
// Display-size commands await real size-operation completion, with a separate
// 65-second deadline; an accepted setting is not treated as a resize ACK.
// Video restart waits for an older real frame ACK when necessary (65 seconds).
// The service must route frame ACKs independently of waiting command queues.
// A failed asynchronous start still returns its binding snapshot alongside
// the error so the caller can retain the exact identity for cleanup.
- (void)startWithCompletion:(CUPreviewBridgeCompletion)completion;
- (void)performCommand:(NSString *)command
             arguments:(NSDictionary *)arguments
            completion:(CUPreviewBridgeCompletion)completion;
- (void)acknowledgeEncodedFrame:(NSDictionary *)acknowledgement
                    completion:(CUPreviewBridgeCompletion)completion;
- (void)closeWithCompletion:(CUPreviewBridgeCompletion)completion;

// Call only through the trusted provider-lifecycle path, after a same-endpoint,
// same-epoch providerDestroyed receipt. Loss/timeout is never that receipt.
- (void)confirmProviderDestroyedWithProof:(NSDictionary *)proof
                              completion:(CUPreviewBridgeCompletion)completion;

// Owner-main-thread snapshot; endpoint nonce is deliberately omitted.
- (NSDictionary *)snapshot;
@end

NS_ASSUME_NONNULL_END
