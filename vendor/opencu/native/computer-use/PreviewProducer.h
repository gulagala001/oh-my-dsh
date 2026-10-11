#import <Cocoa/Cocoa.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <QuartzCore/QuartzCore.h>
#import <mach/mach.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT NSString *const CUPreviewProducerErrorDomain;
FOUNDATION_EXPORT CGSize CUPreviewPresentationSize(CGSize sourceSize, double maximumDisplaySize);
// Exact ownership rule from RemoteHostedPIPWindowOwnership. Optional IDs must
// come from the source's real AX/window/presentation state, not guessed IDs.
FOUNDATION_EXPORT NSNumber *_Nullable CUPreviewOwnerWindowID(uint32_t windowID, NSString *role, NSString *_Nullable subrole, BOOL isModal, NSNumber *_Nullable parentWindowID, NSNumber *_Nullable mostRecentWindowID, NSNumber *_Nullable mainWindowID, NSNumber *_Nullable existingParentWindowID);

@class CUSession, CUWindow;
// Invoked on the native owner main thread. windows contains strongly retained
// real AXUIElement objects keyed by NSNumber window IDs; never JSON objects.
// The remaining fields are actual process identity, mostRecentWindowID,
// mainWindowID and ordered active source-bound presentationWindowIDs. The Sheet fallback is
// derived from those live presentations, not a saved child/parent map.
typedef NSDictionary *_Nullable (^CUPreviewWindowContextProvider)(CUSession *session, CUWindow *target);
FOUNDATION_EXPORT void CUSetPreviewWindowContextProvider(CUPreviewWindowContextProvider _Nullable provider);
FOUNDATION_EXPORT BOOL CURefreshPreviewAssociatedWindows(CUSession *session, NSError **error);
// Parent-chain and real WindowServer association lookup against that same
// native cached-window/active-presentation snapshot, including starting
// source-bound streams and excluding streams already removed for ending.
FOUNDATION_EXPORT NSNumber *_Nullable CUPreviewParentWindowID(uint32_t windowID, NSDictionary *windowContext);
FOUNDATION_EXPORT NSNumber *_Nullable CUPreviewExistingParentWindowID(NSDictionary *windowContext);
FOUNDATION_EXPORT NSArray<NSNumber *> *_Nullable CUPreviewAssociatedWindowIDs(NSDictionary *windowContext, CUWindow *target);

@interface CUPreviewFence : NSObject
@property(nonatomic, readonly) mach_port_t port;
- (instancetype)init NS_UNAVAILABLE;
@end

typedef void (^CUPreviewFrameReply)(NSError *_Nullable error);
// Invoked on the owner main thread. Data/configuration are copied NSData;
// timestamp is native nanoseconds. Convert to microseconds once at the JS
// frame bridge. Reply only after the real host RPC completes, never on encode.
typedef void (^CUPreviewEncodedFrameHandler)(NSDictionary *frame, CUPreviewFrameReply reply);
// Called on the owner main thread inside a disabled-actions CA transaction.
// The renderer owns native presentation-point geometry, independently of the
// buffer's pixel dimensions. YES requires real content and finite positive
// root bounds; raw capture dimensions are not a presentation size.
typedef BOOL (^CUPreviewPixelRenderer)(CALayer *rootLayer, CVPixelBufferRef buffer, NSError **error);

// Owns the real remote layer context. Renderer and transport are supplied by
// their native owner; constructing a context alone does not publish content.
@interface CUPreviewProducer : NSObject
@property(nonatomic, readonly, copy) NSDictionary *identity;
@property(nonatomic, readonly) uint32_t contextID;
@property(nonatomic, readonly) CALayer *rootLayer;
@property(nonatomic, copy, nullable) void (^failureHandler)(NSError *error);
@property(nonatomic, copy, nullable) void (^sourceSizeHandler)(CGSize size);
// A published root cannot resize before the owner prepares a real host fence.
@property(nonatomic, copy, nullable) void (^presentationResizeHandler)(CGSize desiredSize, NSUInteger requestToken);
- (nullable instancetype)initWithIdentity:(NSDictionary *)identity
                    maximumPixelDimension:(double)maximumPixelDimension
                                 renderer:(CUPreviewPixelRenderer)renderer
                             frameHandler:(CUPreviewEncodedFrameHandler)frameHandler
                                    error:(NSError **)error;
// Native SCK sample renderer: no JPEG/CGImage or manufactured CMSampleBuffer.
- (nullable instancetype)initWithIdentity:(NSDictionary *)identity
                    maximumPixelDimension:(double)maximumPixelDimension
                       maximumDisplaySize:(double)maximumDisplaySize
                             frameHandler:(CUPreviewEncodedFrameHandler)frameHandler
                                    error:(NSError **)error;
- (instancetype)init NS_UNAVAILABLE;
- (nullable CUPreviewFence *)createFence;
- (BOOL)setFence:(CUPreviewFence *)fence error:(NSError **)error;
- (void)setPublished:(BOOL)published;
- (void)setVideoEnabled:(BOOL)enabled;
// Finite values are ceil-rounded and clamped to the source's 2..720 range.
- (BOOL)setMaximumPixelDimension:(double)maximumPixelDimension error:(NSError **)error;
- (BOOL)setMaximumDisplaySize:(double)maximumDisplaySize error:(NSError **)error;
// Sets the verified capture source's initial point aspect, before any sample
// is rendered or the context is published. This is not a render/publication ACK.
- (BOOL)prepareInitialSourceSize:(CGSize)sourceSize error:(NSError **)error;
- (void)receivePixelBuffer:(CVPixelBufferRef)buffer;
- (void)receiveSampleBuffer:(CMSampleBufferRef)sample;
- (void)setSourceFrameGeneration:(NSUInteger)generation;
- (void)receiveSampleBuffer:(CMSampleBufferRef)sample sourceGeneration:(NSUInteger)generation;
// A separate real cursor-window SCStream supplies these samples. Geometry is
// the full target and its clipped capture viewport in CG/SCK global points,
// not the physical cursor window frame or a pointer location.
- (BOOL)setCursorSourceGeneration:(NSUInteger)generation error:(NSError **)error;
- (BOOL)setCursorTargetBounds:(CGRect)targetBounds cursorBounds:(CGRect)cursorBounds sourceGeneration:(NSUInteger)generation error:(NSError **)error;
- (void)receiveCursorSampleBuffer:(CMSampleBufferRef)sample sourceGeneration:(NSUInteger)generation;
- (void)clearCursorSource;
- (BOOL)setFrameDeliverySuspended:(BOOL)suspended error:(NSError **)error;
// Tokens belong to this producer, not the host's operationID. Mark prepared
// only after real host prepare ACK; complete only after real complete ACK.
- (BOOL)markPresentationSizeRequestPrepared:(NSUInteger)requestToken fence:(CUPreviewFence *)fence error:(NSError **)error;
- (BOOL)applyPresentationSize:(CGSize)size requestToken:(NSUInteger)requestToken preparedFence:(CUPreviewFence *)fence error:(NSError **)error;
- (BOOL)completePresentationSizeRequest:(NSUInteger)requestToken error:(NSError **)error;
- (BOOL)failPresentationSizeRequest:(NSUInteger)requestToken failure:(NSError *)failure error:(NSError **)error;
- (NSDictionary *)snapshot;
// Stops video immediately; layer detachment belongs to the explicit end ACK.
- (void)stopVideoDelivery;
- (void)invalidate;
@end

// Attach only a source-owned producer whose capture/window/process identity
// matches the live preview. The caller retains it through host teardown ACK.
BOOL CUBindPreviewProducer(CUSession *session, CUPreviewProducer *producer, NSError **error);
void CUUnbindPreviewProducer(CUSession *session, CUPreviewProducer *producer);
// Pure locked identity snapshot, without screenshot/read wait or UI lookup.
NSDictionary *_Nullable CUPreviewSourceIdentity(CUSession *session, NSError **error);
void CUUpdatePreviewCursorOwnerSessionLabel(CUSession *session, NSString *_Nullable label);
// Accepts a source-owned ID list. The identity snapshot exposes reconfiguring;
// acceptance is not a completed filter/configuration or host resize ACK.
BOOL CUUpdatePreviewAssociatedWindowIDs(CUSession *session, NSArray<NSNumber *> *windowIDs, NSError **error);

NS_ASSUME_NONNULL_END
