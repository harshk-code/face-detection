#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MediaPipeFaceMesh, NSObject)

RCT_EXTERN_METHOD(detectFaceMesh:(NSString *)imagePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createNormalizedFaceCrop:(NSString *)imagePath
                  crop:(NSDictionary *)crop
                  targetWidth:(nonnull NSNumber *)targetWidth
                  targetHeight:(nonnull NSNumber *)targetHeight
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
