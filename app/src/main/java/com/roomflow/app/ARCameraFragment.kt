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
        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        
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
            
            val previewView = androidx.camera.view.PreviewView(requireContext())
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
        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            val rotationMatrix = FloatArray(9)
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
            val orientation = FloatArray(3)
            SensorManager.getOrientation(rotationMatrix, orientation)
            
            // pitch is orientation[1] in radians
            val pitchRad = orientation[1]
            devicePitch = Math.toDegrees(pitchRad.toDouble()).toFloat()
            
            // Replicate web logic: distance = height * tan(theta)
            // theta is angle from vertical (90 - pitch)
            // If phone is vertical, pitch is ~0, theta is 90 -> dist infinity
            // If phone is face down, pitch is -90, theta is 0 -> dist 0
            
            val thetaDeg = 90f + devicePitch
            if (thetaDeg in 10f..85f) {
                val distFeet = cameraHeight * tan(Math.toRadians(thetaDeg.toDouble())).toFloat()
                updateDistanceDisplay(distFeet)
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
