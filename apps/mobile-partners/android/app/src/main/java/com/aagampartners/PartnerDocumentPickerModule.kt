package com.aagampartners

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PartnerDocumentPickerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {
  private var pendingPromise: Promise? = null
  private var pendingCameraUri: Uri? = null
  private var pendingMode: String? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = "AagamPartnerDocumentPicker"

  @ReactMethod
  fun pickDocument(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("DOCUMENT_ACTIVITY_MISSING", "Document selection requires an active screen")
      return
    }
    if (!beginRequest("DOCUMENT", promise)) return
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(
        Intent.EXTRA_MIME_TYPES,
        arrayOf("image/jpeg", "image/png", "image/webp", "application/pdf"),
      )
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    try {
      activity.startActivityForResult(Intent.createChooser(intent, "Choose document"), REQUEST_DOCUMENT)
    } catch (error: Exception) {
      finishWithError("DOCUMENT_PICKER_FAILED", "Document picker could not be opened", error)
    }
  }

  @ReactMethod
  fun captureImage(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("CAMERA_ACTIVITY_MISSING", "Camera capture requires an active screen")
      return
    }
    if (!beginRequest("CAMERA", promise)) return
    val displayName = "aagam-${SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())}.jpg"
    val values = ContentValues().apply {
      put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
      put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
        put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/AAGAM Partners")
      }
    }
    val uri = reactContext.contentResolver.insert(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      values,
    )
    if (uri == null) {
      finishWithError("CAMERA_FILE_FAILED", "Camera file could not be prepared")
      return
    }
    pendingCameraUri = uri
    val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
      putExtra(MediaStore.EXTRA_OUTPUT, uri)
      addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    try {
      activity.startActivityForResult(intent, REQUEST_CAMERA)
    } catch (error: Exception) {
      reactContext.contentResolver.delete(uri, null, null)
      finishWithError("CAMERA_OPEN_FAILED", "Camera could not be opened", error)
    }
  }

  /**
   * Delivery evidence is uploaded immediately and must not remain in the public
   * MediaStore gallery. Only camera URIs created by this module are passed here.
   */
  @ReactMethod
  fun deleteCapturedImage(uriValue: String, promise: Promise) {
    try {
      val uri = Uri.parse(uriValue)
      if (uri.scheme != "content" || uri.authority != MediaStore.AUTHORITY) {
        promise.reject("CAMERA_URI_INVALID", "Only captured MediaStore images can be deleted")
        return
      }
      val deleted = reactContext.contentResolver.delete(uri, null, null)
      promise.resolve(deleted > 0)
    } catch (error: Exception) {
      promise.reject("CAMERA_DELETE_FAILED", "Captured image could not be removed", error)
    }
  }

  private fun beginRequest(mode: String, promise: Promise): Boolean {
    if (pendingPromise != null) {
      promise.reject("DOCUMENT_PICKER_BUSY", "Another document action is already open")
      return false
    }
    pendingPromise = promise
    pendingMode = mode
    return true
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_DOCUMENT && requestCode != REQUEST_CAMERA) return
    if (resultCode != Activity.RESULT_OK) {
      if (requestCode == REQUEST_CAMERA) {
        pendingCameraUri?.let { reactContext.contentResolver.delete(it, null, null) }
      }
      finishWithError("DOCUMENT_PICKER_CANCELLED", "Document selection was cancelled")
      return
    }

    val uri = if (requestCode == REQUEST_CAMERA) pendingCameraUri else data?.data
    if (uri == null) {
      finishWithError("DOCUMENT_URI_MISSING", "Selected document could not be read")
      return
    }

    if (requestCode == REQUEST_DOCUMENT) {
      try {
        reactContext.contentResolver.takePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      } catch (_: Exception) {
        // Some providers expose a valid temporary URI without persistable permission.
      }
    }

    try {
      pendingPromise?.resolve(documentMap(uri))
      clearPending()
    } catch (error: Exception) {
      finishWithError("DOCUMENT_METADATA_FAILED", "Selected document metadata could not be read", error)
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun documentMap(uri: Uri) = Arguments.createMap().apply {
    val resolver = reactContext.contentResolver
    var name = if (pendingMode == "CAMERA") "aagam-camera.jpg" else "document"
    var size = 0.0
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
      ?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
          if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex).toDouble()
        }
      }
    putString("uri", uri.toString())
    putString("name", name.take(180))
    putString("type", resolver.getType(uri) ?: if (pendingMode == "CAMERA") "image/jpeg" else "application/octet-stream")
    putDouble("size", size)
    putString("source", pendingMode)
  }

  private fun finishWithError(code: String, message: String, error: Throwable? = null) {
    pendingPromise?.reject(code, message, error)
    clearPending()
  }

  private fun clearPending() {
    pendingPromise = null
    pendingCameraUri = null
    pendingMode = null
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(this)
    clearPending()
    super.invalidate()
  }

  companion object {
    private const val REQUEST_DOCUMENT = 7821
    private const val REQUEST_CAMERA = 7822
  }
}
