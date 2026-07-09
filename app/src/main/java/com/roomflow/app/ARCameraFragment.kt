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
        if (ContextCompat.checkSelfPermission(requireContext(), android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            return
        }
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            
            val previewView = androidx.camera.view.PreviewView(requireContext()).apply {
                layoutParams = android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT
                )
            }
            binding.arSurfaceContainer.removeAllViews()
            binding.arSurfaceContainer.addView(previewView)

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(viewLifecycleOwner, cameraSelector, preview)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            val ax = event.values[0]
            val ay = event.values[1]
            val az = event.values[2]
            
            val g = Math.sqrt((ax * ax + ay * ay + az * az).toDouble())
            if (g > 0.1) {
                // Cosine of angle between phone's Y-axis (long edge) and gravity vector
                // Gravity pulls down, so ay tells us how much the phone is tilted.
                val cosTheta = ay / g
                val thetaRad = Math.acos(Math.max(-1.0, Math.min(1.0, cosTheta)))
                val thetaDeg = Math.toDegrees(thetaRad).toFloat()
                
                // When aiming at the floor corner:
                // If phone is held vertical, tilt is ~90 degrees from downward gravity.
                // If tilted down, the tilt angle from downward gravity decreases.
                // The angle from the vertical aiming line is:
                val aimAngleDeg = 90f - thetaDeg
                
                if (aimAngleDeg in 5f..80f) {
                    val distFeet = cameraHeight * tan(Math.toRadians(aimAngleDeg.toDouble())).toFloat()
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
