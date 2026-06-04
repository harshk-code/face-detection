package com.morthhackathon

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import java.io.File
import kotlin.math.max

class MediaPipeFaceMeshModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private var faceLandmarker: FaceLandmarker? = null
  private val maxMediaPipeBitmapSide = 1280

  override fun getName(): String = "MediaPipeFaceMesh"

  @ReactMethod
  fun detectFaceMesh(imagePath: String, promise: Promise) {
    try {
      val resolvedImagePath = imagePath.removePrefix("file://")
      val imageFile = File(resolvedImagePath)
      if (!imageFile.exists()) {
        promise.reject("MEDIA_PIPE_IMAGE_MISSING", "Image file does not exist: $resolvedImagePath")
        return
      }

      val loadedBitmap = loadUprightBitmap(resolvedImagePath)
      val bitmap = loadedBitmap.bitmap
      Log.d(
          "MediaPipeFaceMesh",
          "Detecting face mesh path=$resolvedImagePath width=${bitmap.width} height=${bitmap.height} exifOrientation=${loadedBitmap.exifOrientation} rotationDegrees=${loadedBitmap.rotationDegrees}")
      val landmarker = getFaceLandmarker()
      val detection = detectFaceLandmarks(landmarker, bitmap)

      if (detection == null) {
        promise.reject(
            "MEDIA_PIPE_FACE_NOT_FOUND",
            "MediaPipe Face Mesh did not detect a face. " +
                "bitmap=${bitmap.width}x${bitmap.height}, " +
                "exifOrientation=${loadedBitmap.exifOrientation}, " +
                "rotationDegrees=${loadedBitmap.rotationDegrees}, " +
                "fileBytes=${imageFile.length()}.")
        return
      }

      val landmarkArray = Arguments.createArray()
      var minX = Float.POSITIVE_INFINITY
      var minY = Float.POSITIVE_INFINITY
      var maxX = Float.NEGATIVE_INFINITY
      var maxY = Float.NEGATIVE_INFINITY

      detection.landmarks.forEach { landmark ->
        val pixelX = landmark.x
        val pixelY = landmark.y
        minX = minOf(minX, pixelX)
        minY = minOf(minY, pixelY)
        maxX = maxOf(maxX, pixelX)
        maxY = maxOf(maxY, pixelY)

        landmarkArray.pushMap(
            Arguments.createMap().apply {
              putInt("index", landmark.index)
              putDouble("x", pixelX.toDouble())
              putDouble("y", pixelY.toDouble())
              putDouble("z", landmark.z.toDouble())
              putDouble("normalizedX", (pixelX / bitmap.width).toDouble())
              putDouble("normalizedY", (pixelY / bitmap.height).toDouble())
            })
      }

      promise.resolve(
          Arguments.createMap().apply {
            putDouble("imageWidth", bitmap.width.toDouble())
            putDouble("imageHeight", bitmap.height.toDouble())
            putMap(
                "bounds",
                Arguments.createMap().apply {
                  putDouble("x", minX.toDouble())
                  putDouble("y", minY.toDouble())
                  putDouble("width", (maxX - minX).toDouble())
                  putDouble("height", (maxY - minY).toDouble())
                })
            putDouble("detectionRotationDegrees", detection.rotationDegrees.toDouble())
            putArray("landmarks", landmarkArray)
          })
    } catch (error: Throwable) {
      Log.e("MediaPipeFaceMesh", "Face mesh detection failed", error)
      promise.reject("MEDIA_PIPE_FACE_MESH_FAILED", error)
    }
  }

  @ReactMethod
  fun createNormalizedFaceCrop(
      imagePath: String,
      crop: ReadableMap,
      targetWidth: Double,
      targetHeight: Double,
      promise: Promise
  ) {
    try {
      val resolvedImagePath = imagePath.removePrefix("file://")
      val bitmap = loadUprightBitmap(resolvedImagePath).bitmap
      val targetW = targetWidth.toInt().coerceAtLeast(1)
      val targetH = targetHeight.toInt().coerceAtLeast(1)
      val startX = crop.getDouble("startX").toInt().coerceIn(0, bitmap.width - 1)
      val startY = crop.getDouble("startY").toInt().coerceIn(0, bitmap.height - 1)
      val endX = crop.getDouble("endX").toInt().coerceIn(startX + 1, bitmap.width)
      val endY = crop.getDouble("endY").toInt().coerceIn(startY + 1, bitmap.height)
      val cropWidth = (endX - startX).coerceAtLeast(1)
      val cropHeight = (endY - startY).coerceAtLeast(1)
      val cropped = Bitmap.createBitmap(bitmap, startX, startY, cropWidth, cropHeight)
      val resized = Bitmap.createScaledBitmap(cropped, targetW, targetH, true)
      val pixels = IntArray(targetW * targetH)
      resized.getPixels(pixels, 0, targetW, 0, 0, targetW, targetH)
      val normalized = Arguments.createArray()

      pixels.forEach { pixel ->
        val r = pixel shr 16 and 0xff
        val g = pixel shr 8 and 0xff
        val b = pixel and 0xff
        normalized.pushDouble(normalizeRgbPixel(r))
        normalized.pushDouble(normalizeRgbPixel(g))
        normalized.pushDouble(normalizeRgbPixel(b))
      }

      promise.resolve(
          Arguments.createMap().apply {
            putInt("byteLength", targetW * targetH * 3 * 4)
            putInt("height", targetH)
            putArray("normalizedRgb", normalized)
            putString("pixelFormat", "RGB")
            putInt("width", targetW)
          })
    } catch (error: Throwable) {
      Log.e("MediaPipeFaceMesh", "Native face crop failed", error)
      promise.reject("MEDIA_PIPE_FACE_CROP_FAILED", error)
    }
  }

  private fun getFaceLandmarker(): FaceLandmarker {
    val existingLandmarker = faceLandmarker
    if (existingLandmarker != null) {
      return existingLandmarker
    }

    val options =
        FaceLandmarker.FaceLandmarkerOptions.builder()
            .setBaseOptions(
                BaseOptions.builder().setModelAssetPath("models/face_landmarker.task").build())
            .setRunningMode(RunningMode.IMAGE)
            .setNumFaces(1)
            .setMinFaceDetectionConfidence(0.25f)
            .setMinFacePresenceConfidence(0.25f)
            .setMinTrackingConfidence(0.5f)
            .build()
    val createdLandmarker = FaceLandmarker.createFromOptions(reactContext, options)
    faceLandmarker = createdLandmarker

    return createdLandmarker
  }

  private fun loadUprightBitmap(path: String): LoadedBitmap {
    val decodedBitmap =
        BitmapFactory.decodeFile(path)
            ?: throw IllegalArgumentException("Unable to decode image file: $path")
    val orientation = ExifInterface(path).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL,
    )
    val degrees =
        when (orientation) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90f
          ExifInterface.ORIENTATION_ROTATE_180 -> 180f
          ExifInterface.ORIENTATION_ROTATE_270 -> 270f
          else -> 0f
        }

    val uprightBitmap =
        if (degrees == 0f) {
          decodedBitmap
        } else {
          val matrix = Matrix().apply { postRotate(degrees) }

          Bitmap.createBitmap(
              decodedBitmap,
              0,
              0,
              decodedBitmap.width,
              decodedBitmap.height,
              matrix,
              true,
          )
        }
    val scaledBitmap = scaleBitmapForMediaPipe(uprightBitmap)
    val argbBitmap =
        if (scaledBitmap.config == Bitmap.Config.ARGB_8888) {
          scaledBitmap
        } else {
          scaledBitmap.copy(Bitmap.Config.ARGB_8888, false)
        }

    return LoadedBitmap(
        bitmap = argbBitmap,
        exifOrientation = orientation,
        rotationDegrees = degrees,
    )
  }

  private fun scaleBitmapForMediaPipe(bitmap: Bitmap): Bitmap {
    val longestSide = max(bitmap.width, bitmap.height)

    if (longestSide <= maxMediaPipeBitmapSide) {
      return bitmap
    }

    val scale = maxMediaPipeBitmapSide.toFloat() / longestSide.toFloat()
    val targetWidth = (bitmap.width * scale).toInt().coerceAtLeast(1)
    val targetHeight = (bitmap.height * scale).toInt().coerceAtLeast(1)

    return Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
  }

  private fun detectFaceLandmarks(
      landmarker: FaceLandmarker,
      bitmap: Bitmap,
  ): FaceMeshDetection? {
    val rotationDegrees = listOf(0, 90, 270, 180)

    for (rotation in rotationDegrees) {
      val candidateBitmap = rotateBitmap(bitmap, rotation)
      val faces = landmarker.detect(BitmapImageBuilder(candidateBitmap).build()).faceLandmarks()

      if (faces.isNotEmpty()) {
        Log.d(
            "MediaPipeFaceMesh",
            "Detected face mesh using candidateRotation=$rotation candidate=${candidateBitmap.width}x${candidateBitmap.height}")

        return FaceMeshDetection(
            landmarks =
                mapLandmarksToBaseBitmap(
                    faces[0],
                    candidateBitmap.width,
                    candidateBitmap.height,
                    bitmap.width,
                    bitmap.height,
                    rotation,
                ),
            rotationDegrees = rotation,
        )
      }
    }

    return null
  }

  private fun rotateBitmap(bitmap: Bitmap, degrees: Int): Bitmap {
    if (degrees == 0) {
      return bitmap
    }

    val matrix = Matrix().apply { postRotate(degrees.toFloat()) }

    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  private fun mapLandmarksToBaseBitmap(
      landmarks: List<NormalizedLandmark>,
      candidateWidth: Int,
      candidateHeight: Int,
      baseWidth: Int,
      baseHeight: Int,
      rotationDegrees: Int,
  ): List<MappedLandmark> =
      landmarks.mapIndexed { index, landmark ->
        val candidateX = landmark.x() * candidateWidth
        val candidateY = landmark.y() * candidateHeight
        val basePoint = mapCandidatePointToBase(
            candidateX,
            candidateY,
            baseWidth,
            baseHeight,
            rotationDegrees,
        )

        MappedLandmark(
            index = index,
            x = basePoint.first,
            y = basePoint.second,
            z = landmark.z(),
        )
      }

  private fun mapCandidatePointToBase(
      candidateX: Float,
      candidateY: Float,
      baseWidth: Int,
      baseHeight: Int,
      rotationDegrees: Int,
  ): Pair<Float, Float> =
      when (rotationDegrees) {
        90 -> Pair(candidateY, baseHeight - candidateX)
        180 -> Pair(baseWidth - candidateX, baseHeight - candidateY)
        270 -> Pair(baseWidth - candidateY, candidateX)
      else -> Pair(candidateX, candidateY)
      }

  private fun normalizeRgbPixel(value: Int): Double =
      (value.toDouble() - 127.5) / 128.0

  private data class LoadedBitmap(
      val bitmap: Bitmap,
      val exifOrientation: Int,
      val rotationDegrees: Float,
  )

  private data class FaceMeshDetection(
      val landmarks: List<MappedLandmark>,
      val rotationDegrees: Int,
  )

  private data class MappedLandmark(
      val index: Int,
      val x: Float,
      val y: Float,
      val z: Float,
  )
}
