#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(EventQueueStore, NSObject)
RCT_EXTERN_METHOD(getEvents:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(saveEvents:(NSString *)eventsJson resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearEvents:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
@end
