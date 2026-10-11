#ifndef OPENCU_DESKTOP_PRESENTATIONS_MOTION_DRIVER_H
#define OPENCU_DESKTOP_PRESENTATIONS_MOTION_DRIVER_H

#import <Foundation/Foundation.h>
#import <CoreVideo/CoreVideo.h>
#import <QuartzCore/CAMediaTiming.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^OPMotionFrameHandler)(CFTimeInterval timestamp);

// Lifecycle and state methods are called on the main thread. The frame handler
// runs there and controls needsMotion after the host finishes its real frame.
@interface OPMotionDisplayLinkDriver : NSObject

- (instancetype)initWithFrameHandler:(OPMotionFrameHandler)frameHandler
    NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@property(nonatomic) BOOL needsMotion;
@property(nonatomic) BOOL contrastSampling;
@property(nonatomic, readonly, getter=isRunning) BOOL running;
@property(nonatomic, readonly) CFTimeInterval lastMotionTimestamp;

- (CVReturn)startMotionDisplayLink;
- (CVReturn)startDisplayLink;
- (void)stopMotionDisplayLink;
- (void)stopDisplayLinkIfIdle;
- (void)releaseMotionDisplayLink;

- (CVReturn)startControlIconContrastSampling;
- (void)stopControlIconContrastSampling;

// The host records this only when its motion branch actually executes.
- (void)recordMotionTimestamp:(CFTimeInterval)timestamp;

@end

NS_ASSUME_NONNULL_END

#endif
