package com.roomflow.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.fragment.app.Fragment
import com.roomflow.app.databinding.FragmentView3dBinding

class View3DFragment : Fragment() {
    private var _binding: FragmentView3dBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentView3dBinding.inflate(inflater, container, false)
        setup3DWebView()
        return binding.root
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setup3DWebView() {
        binding.webView3d.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
        }
        binding.webView3d.webViewClient = WebViewClient()
        binding.webView3d.webChromeClient = WebChromeClient()

        // Load a minimal bridge page that has THREE.js and renderer3d.js
        binding.webView3d.loadUrl("file:///android_asset/3d_view.html")

        ProjectManager.addListener {
            syncDataToJS()
        }
    }

    private fun syncDataToJS() {
        val json = com.google.gson.Gson().toJson(ProjectManager.state)
        binding.webView3d.post {
            binding.webView3d.evaluateJavascript("if(window.syncProject) window.syncProject($json);", null)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
