import Foundation
import MediaPipeTasksVision
import React
import UIKit

@objc(MediaPipeFaceMesh)
class MediaPipeFaceMesh: NSObject {
  private var faceLandmarker: FaceLandmarker?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(detectFaceMesh:resolver:rejecter:)
  func detectFaceMesh(
    imagePath: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    do {
      guard FileManager.default.fileExists(atPath: imagePath) else {
        reject("MEDIA_PIPE_IMAGE_MISSING", "Image file does not exist: \(imagePath)", nil)
        return
      }

      guard let loadedImage = UIImage(contentsOfFile: imagePath) else {
        reject("MEDIA_PIPE_IMAGE_DECODE_FAILED", "Unable to decode image file: \(imagePath)", nil)
        return
      }

      let image = loadedImage.normalizedUpOrientation()
      let mpImage = try MPImage(uiImage: image)
      let result = try getFaceLandmarker().detect(image: mpImage)
      let faces = result.faceLandmarks

      guard let landmarks = faces.first, !landmarks.isEmpty else {
        reject("MEDIA_PIPE_FACE_NOT_FOUND", "MediaPipe Face Mesh did not detect a face.", nil)
        return
      }

      let imageWidth = Double(image.size.width * image.scale)
      let imageHeight = Double(image.size.height * image.scale)
      var minX = Double.greatestFiniteMagnitude
      var minY = Double.greatestFiniteMagnitude
      var maxX = -Double.greatestFiniteMagnitude
      var maxY = -Double.greatestFiniteMagnitude
      var landmarkPayload: [[String: Any]] = []

      for (index, landmark) in landmarks.enumerated() {
        let pixelX = Double(landmark.x) * imageWidth
        let pixelY = Double(landmark.y) * imageHeight
        minX = min(minX, pixelX)
        minY = min(minY, pixelY)
        maxX = max(maxX, pixelX)
        maxY = max(maxY, pixelY)

        landmarkPayload.append([
          "index": index,
          "x": pixelX,
          "y": pixelY,
          "z": Double(landmark.z),
          "normalizedX": Double(landmark.x),
          "normalizedY": Double(landmark.y),
        ])
      }

      resolve([
        "imageWidth": imageWidth,
        "imageHeight": imageHeight,
        "bounds": [
          "x": minX,
          "y": minY,
          "width": maxX - minX,
          "height": maxY - minY,
        ],
        "landmarks": landmarkPayload,
      ])
    } catch {
      reject("MEDIA_PIPE_FACE_MESH_FAILED", error.localizedDescription, error)
    }
  }

  @objc(createNormalizedFaceCrop:crop:targetWidth:targetHeight:resolver:rejecter:)
  func createNormalizedFaceCrop(
    imagePath: String,
    crop: NSDictionary,
    targetWidth: NSNumber,
    targetHeight: NSNumber,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    do {
      guard FileManager.default.fileExists(atPath: imagePath) else {
        reject("MEDIA_PIPE_IMAGE_MISSING", "Image file does not exist: \(imagePath)", nil)
        return
      }

      guard let loadedImage = UIImage(contentsOfFile: imagePath) else {
        reject("MEDIA_PIPE_IMAGE_DECODE_FAILED", "Unable to decode image file: \(imagePath)", nil)
        return
      }

      guard let sourceCgImage = loadedImage.normalizedUpOrientation().cgImage else {
        reject("MEDIA_PIPE_IMAGE_DECODE_FAILED", "Unable to access image pixels: \(imagePath)", nil)
        return
      }

      let targetW = max(1, targetWidth.intValue)
      let targetH = max(1, targetHeight.intValue)
      let startX = clampInt(readCropValue(crop, "startX"), min: 0, max: sourceCgImage.width - 1)
      let startY = clampInt(readCropValue(crop, "startY"), min: 0, max: sourceCgImage.height - 1)
      let endX = clampInt(readCropValue(crop, "endX"), min: startX + 1, max: sourceCgImage.width)
      let endY = clampInt(readCropValue(crop, "endY"), min: startY + 1, max: sourceCgImage.height)
      let cropRect = CGRect(
        x: CGFloat(startX),
        y: CGFloat(startY),
        width: CGFloat(endX - startX),
        height: CGFloat(endY - startY)
      )

      guard let croppedCgImage = sourceCgImage.cropping(to: cropRect) else {
        reject("MEDIA_PIPE_FACE_CROP_FAILED", "Unable to crop face image.", nil)
        return
      }

      let normalizedRgb = try resizeAndNormalizeRgb(
        cgImage: croppedCgImage,
        targetWidth: targetW,
        targetHeight: targetH
      )

      resolve([
        "byteLength": targetW * targetH * 3 * MemoryLayout<Float>.size,
        "height": targetH,
        "normalizedRgb": normalizedRgb,
        "pixelFormat": "RGB",
        "width": targetW,
      ])
    } catch {
      reject("MEDIA_PIPE_FACE_CROP_FAILED", error.localizedDescription, error)
    }
  }

  private func getFaceLandmarker() throws -> FaceLandmarker {
    if let faceLandmarker {
      return faceLandmarker
    }

    guard let modelPath = Bundle.main.path(forResource: "face_landmarker", ofType: "task") else {
      throw NSError(
        domain: "MediaPipeFaceMesh",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "face_landmarker.task was not found in the app bundle."]
      )
    }

    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = modelPath
    options.runningMode = .image
    options.numFaces = 1
    options.minFaceDetectionConfidence = 0.5
    options.minFacePresenceConfidence = 0.5
    options.minTrackingConfidence = 0.5

    let createdFaceLandmarker = try FaceLandmarker(options: options)
    faceLandmarker = createdFaceLandmarker

    return createdFaceLandmarker
  }

  private func readCropValue(_ crop: NSDictionary, _ key: String) -> Int {
    if let number = crop[key] as? NSNumber {
      return number.intValue
    }

    return 0
  }

  private func clampInt(_ value: Int, min minValue: Int, max maxValue: Int) -> Int {
    Swift.min(Swift.max(value, minValue), maxValue)
  }

  private func resizeAndNormalizeRgb(
    cgImage: CGImage,
    targetWidth: Int,
    targetHeight: Int
  ) throws -> [Double] {
    let bytesPerPixel = 4
    let bytesPerRow = targetWidth * bytesPerPixel
    var pixels = [UInt8](repeating: 0, count: targetHeight * bytesPerRow)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue |
      CGBitmapInfo.byteOrder32Big.rawValue

    guard let context = CGContext(
      data: &pixels,
      width: targetWidth,
      height: targetHeight,
      bitsPerComponent: 8,
      bytesPerRow: bytesPerRow,
      space: colorSpace,
      bitmapInfo: bitmapInfo
    ) else {
      throw NSError(
        domain: "MediaPipeFaceMesh",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Unable to create bitmap context for face crop."]
      )
    }

    context.interpolationQuality = .high
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))

    var normalized = [Double]()
    normalized.reserveCapacity(targetWidth * targetHeight * 3)

    for index in stride(from: 0, to: pixels.count, by: bytesPerPixel) {
      normalized.append(normalizeRgbPixel(Double(pixels[index])))
      normalized.append(normalizeRgbPixel(Double(pixels[index + 1])))
      normalized.append(normalizeRgbPixel(Double(pixels[index + 2])))
    }

    return normalized
  }

  private func normalizeRgbPixel(_ value: Double) -> Double {
    (value - 127.5) / 128.0
  }
}

private extension UIImage {
  func normalizedUpOrientation() -> UIImage {
    if imageOrientation == .up {
      return self
    }

    UIGraphicsBeginImageContextWithOptions(size, false, scale)
    draw(in: CGRect(origin: .zero, size: size))
    let normalizedImage = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()

    return normalizedImage ?? self
  }
}
