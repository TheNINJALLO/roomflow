package com.roomflow.app

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.roomflow.app.databinding.FragmentArcameraBinding
import kotlin.math.tan

class ARCameraFragment : Fragment(), SensorEventListener {
    private var _binding: FragmentArcameraBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var sensorManager: SensorManager
    private var rotationSensor: Sensor? = null
    
    private var devicePitch: Float = 0f // Degrees
    private var cameraHeight: Float = 5.0f // Feet (Default 60 inches)
    
    private val alpha = 0.12f // Smoothing coefficient for Hand Jitter LPF
    private var smoothAx = 0f
    private var smoothAy = 9.8f
    private var smoothAz = 0f

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentArcameraBinding.inflate(inflater, container, false)
        
        sensorManager = requireContext().getSystemService(Context.SENSOR_SERVICE) as SensorManager
        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        
        binding.arPlaceholder.text = "Trigonometry Estimator (ARCore Not Required)"
        
        binding.btnPin.setOnClickListener {
            val distText = binding.arDistText.text.toString()
            Toast.makeText(context, "Pinned: $distText", Toast.LENGTH_SHORT).show()
        }

        return binding.root
    }

    private fun startCamera() {
        val permission = ContextCompat.checkSelfPermission(requireContext(), android.Manifest.permission.CAMERA)
        if (permission != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(context, "Requesting Camera Permission...", Toast.LENGTH_SHORT).show()
            requestPermissions(arrayOf(android.Manifest.permission.CAMERA), 101)
            return
        }
        
        Toast.makeText(context, "Initializing Camera...", Toast.LENGTH_SHORT).show()
        try {
            val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
            cameraProviderFuture.addListener({
                try {
                    val cameraProvider = cameraProviderFuture.get()
                    
                    val previewView = androidx.camera.view.PreviewView(requireContext()).apply {
                        layoutParams = android.widget.FrameLayout.LayoutParams(
                            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                            android.widget.FrameLayout.LayoutParams.MATCH_PARENT
                        )
                        scaleType = androidx.camera.view.PreviewView.ScaleType.FILL_CENTER
                        implementationMode = androidx.camera.view.PreviewView.ImplementationMode.COMPATIBLE
                    }
                    binding.arSurfaceContainer.removeAllViews()
                    binding.arSurfaceContainer.addView(previewView)

                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }

                    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(viewLifecycleOwner, cameraSelector, preview)
                    
                    binding.arSurfaceContainer.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                    binding.arPlaceholder.visibility = android.view.View.GONE
                    Toast.makeText(context, "Camera active!", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    android.util.Log.e("RoomFlow", "CameraX initialization failed", e)
                    Toast.makeText(context, "Camera error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }, ContextCompat.getMainExecutor(requireContext()))
        } catch (e: Exception) {
            android.util.Log.e("RoomFlow", "ProcessCameraProvider failed", e)
            Toast.makeText(context, "Camera provider error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == 101 && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            Toast.makeText(context, "Camera permission is required for layout scanner", Toast.LENGTH_LONG).show()
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            // Apply Hand Jitter Low-Pass Filter (LPF)
            smoothAx = smoothAx + alpha * (event.values[0] - smoothAx)
            smoothAy = smoothAy + alpha * (event.values[1] - smoothAy)
            smoothAz = smoothAz + alpha * (event.values[2] - smoothAz)
            
            val g = Math.sqrt((smoothAx * smoothAx + smoothAy * smoothAy + smoothAz * smoothAz).toDouble())
            if (g > 0.1) {
                // Cosine of angle between phone's long axis (Y) and gravity vector
                val cosTheta = smoothAy / g
                val thetaRad = Math.acos(Math.max(-1.0, Math.min(1.0, cosTheta)))
                val thetaDeg = Math.toDegrees(thetaRad).toFloat()
                
                // When aiming at the floor corner:
                // Pitch/tilt from vertical (gravity) is exactly thetaDeg.
                // Upright = 0 degrees (parallel to gravity). Aiming down = thetaDeg.
                if (thetaDeg in 5f..80f) {
                    val distFeet = cameraHeight * tan(Math.toRadians(thetaDeg.toDouble())).toFloat()
                    updateDistanceDisplay(distFeet)
                }
            }
        }
    }

    private fun updateDistanceDisplay(feet: Float) {
        val totalInches = (feet * 12).toInt()
        val f = totalInches / 12
        val i = totalInches % 12
        binding.arDistText.text = "%d' %d\"".format(f, i)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onResume() {
        super.onResume()
        rotationSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
        startCamera()
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
