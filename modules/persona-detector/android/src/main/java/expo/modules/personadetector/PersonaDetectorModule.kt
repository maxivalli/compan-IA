package expo.modules.personadetector

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeler
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

private const val TAG = "PersonaDetector"
private const val CONFIANZA_MINIMA = 0.35f
private const val COOLDOWN_MS = 1200L

class PersonaDetectorModule : Module() {

    private var cameraProvider: ProcessCameraProvider? = null
    private var analysisExecutor: ExecutorService? = null
    private var labeler: ImageLabeler? = null
    private var isRunning = false
    private var lastHitTime = 0L

    private val etiquetasHumanas = setOf(
        "person", "human", "people", "man", "woman", "boy", "girl",
        "adult", "child", "face", "head", "hair", "body", "skin",
        "clothing", "clothes", "shirt", "t-shirt", "blouse", "top",
        "dress", "skirt", "pants", "trousers", "jeans", "shorts",
        "jacket", "coat", "sweater", "hoodie", "suit",
        "footwear", "shoe", "shoes", "boot", "sandal", "sneaker",
        "glasses", "hat", "cap", "bag", "handbag", "backpack",
        "sitting", "standing", "walking", "running"
    )

    override fun definition() = ModuleDefinition {
        Name("PersonaDetector")

        Events("onPersonDetected", "onDebugLabel")

        Function("startDetection") {
            startCamera()
        }

        Function("stopDetection") {
            stopCamera()
        }

        OnDestroy {
            stopCamera()
        }
    }

    private fun startCamera() {
        if (isRunning) return
        val context = appContext.reactContext ?: run {
            sendDebug("NO_CONTEXT")
            return
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            sendDebug("NO_PERM")
            return
        }

        val labelerOptions = ImageLabelerOptions.Builder()
            .setConfidenceThreshold(CONFIANZA_MINIMA)
            .build()
        labeler = ImageLabeling.getClient(labelerOptions)
        analysisExecutor = Executors.newSingleThreadExecutor()
        isRunning = true

        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                cameraProvider = future.get()
                bindCamera()
            } catch (e: Exception) {
                Log.e(TAG, "CameraProvider init failed: ${e.message}")
                sendDebug("PROVIDER_ERROR: ${e.message}")
                isRunning = false
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun bindCamera() {
        val provider = cameraProvider ?: return
        val executor = analysisExecutor ?: return

        val imageAnalysis = ImageAnalysis.Builder()
            .setTargetResolution(Size(320, 240))
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()

        imageAnalysis.setAnalyzer(executor) { imageProxy ->
            processFrame(imageProxy)
        }

        val cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA

        val activity = appContext.activityProvider?.currentActivity as? LifecycleOwner
            ?: run {
                sendDebug("NO_LIFECYCLE")
                return
            }

        try {
            provider.unbindAll()
            provider.bindToLifecycle(activity, cameraSelector, imageAnalysis)
            sendDebug("CAMERA_READY")
        } catch (e: Exception) {
            Log.e(TAG, "Camera bind failed: ${e.message}")
            sendDebug("BIND_ERROR: ${e.message}")
        }
    }

    private fun processFrame(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        val inputImage = InputImage.fromMediaImage(
            mediaImage,
            imageProxy.imageInfo.rotationDegrees
        )

        labeler?.process(inputImage)
            ?.addOnSuccessListener { labels ->
                var hayPersona = false
                var primeraEtiqueta = "MLKIT_EMPTY"
                for ((i, label) in labels.withIndex()) {
                    val lbl = label.text.lowercase().trim()
                    if (i == 0) primeraEtiqueta = lbl
                    if (etiquetasHumanas.contains(lbl)) {
                        hayPersona = true
                        break
                    }
                }
                sendDebug(if (hayPersona) "HIT:$primeraEtiqueta" else primeraEtiqueta)
                if (hayPersona) {
                    val now = System.currentTimeMillis()
                    if (now - lastHitTime >= COOLDOWN_MS) {
                        lastHitTime = now
                        sendEvent("onPersonDetected", mapOf<String, Any>())
                    }
                }
                imageProxy.close()
            }
            ?.addOnFailureListener { e ->
                sendDebug("MLKIT_ERROR: ${e.message}")
                imageProxy.close()
            }
            ?: imageProxy.close()
    }

    private fun stopCamera() {
        isRunning = false
        val providerToStop = cameraProvider
        cameraProvider = null
        Handler(Looper.getMainLooper()).post {
            providerToStop?.unbindAll()
        }
        analysisExecutor?.shutdown()
        analysisExecutor = null
        labeler?.close()
        labeler = null
    }

    private fun sendDebug(label: String) {
        try {
            sendEvent("onDebugLabel", mapOf("label" to label))
        } catch (_: Exception) {}
    }
}
