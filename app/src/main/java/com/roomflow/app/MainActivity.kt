package com.roomflow.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.ActionBarDrawerToggle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.GravityCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.widget.addTextChangedListener
import androidx.fragment.app.Fragment
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.roomflow.app.databinding.ActivityMainBinding
import com.roomflow.app.databinding.BottomSheetDetailsBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var detailBinding: BottomSheetDetailsBinding? = null
    private val CAMERA_PERMISSION_CODE = 100
    private var isUpdatingUI = false

    private val backPressedCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            if (binding.drawerLayout.isDrawerOpen(GravityCompat.START)) {
                binding.drawerLayout.closeDrawer(GravityCompat.START)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        try {
            enableEdgeToEdge()
            super.onCreate(savedInstanceState)
            binding = ActivityMainBinding.inflate(layoutInflater)
            setContentView(binding.root)

            ViewCompat.setOnApplyWindowInsetsListener(binding.drawerLayout) { v, insets ->
                val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
                insets
            }

            onBackPressedDispatcher.addCallback(this, backPressedCallback)

            setSupportActionBar(binding.toolbar)
            
            // Inflate the toolbar menu (New/Save)
            binding.toolbar.inflateMenu(R.menu.toolbar_menu)
            binding.toolbar.setOnMenuItemClickListener { menuItem ->
                when (menuItem.itemId) {
                    R.id.action_new -> {
                        ProjectManager.clear()
                        true
                    }
                    R.id.action_save -> {
                        ProjectManager.saveProject(this)
                        true
                    }
                    else -> false
                }
            }

            // Hamburger icon button logic
            binding.toolbar.setNavigationOnClickListener {
                binding.drawerLayout.openDrawer(GravityCompat.START)
            }

            // Extended FAB for Toolbox (the primary way to add rooms now)
            binding.fabToolbox.setOnClickListener {
                binding.drawerLayout.openDrawer(GravityCompat.START)
            }

            binding.drawerLayout.addDrawerListener(object : androidx.drawerlayout.widget.DrawerLayout.SimpleDrawerListener() {
                override fun onDrawerOpened(drawerView: View) { backPressedCallback.isEnabled = true }
                override fun onDrawerClosed(drawerView: View) { backPressedCallback.isEnabled = false }
            })

            setupBottomNavigation()
            setupDrawer()
            setupDetailsBottomSheet()

            if (savedInstanceState == null) {
                replaceFragment(Sketch2DFragment())
                binding.bottomNavigation.selectedItemId = R.id.nav_2d
                ProjectManager.loadProject(this)
            }

            checkCameraPermission()
        } catch (e: Exception) {
            android.util.Log.e("RoomFlow", "Fatal crash in onCreate", e)
        }
    }

    private fun setupBottomNavigation() {
        binding.bottomNavigation.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_2d -> {
                    replaceFragment(Sketch2DFragment())
                    binding.fabToolbox.show()
                }
                R.id.nav_3d -> {
                    replaceFragment(View3DFragment())
                    binding.fabToolbox.hide()
                }
                R.id.nav_ar -> {
                    replaceFragment(ARCameraFragment())
                    binding.fabToolbox.hide()
                }
            }
            true
        }
    }

    private fun setupDrawer() {
        binding.navigationView.setNavigationItemSelectedListener { item ->
            when (item.itemId) {
                R.id.add_living -> ProjectManager.addRoom("living")
                R.id.add_bedroom -> ProjectManager.addRoom("bedroom")
                R.id.add_kitchen -> ProjectManager.addRoom("kitchen")
                R.id.add_bathroom -> ProjectManager.addRoom("bathroom")
                R.id.add_hallway -> ProjectManager.addRoom("hallway")
                R.id.add_closet -> ProjectManager.addRoom("closet")
                R.id.add_staircase -> ProjectManager.addRoom("staircase")
                R.id.add_custom -> ProjectManager.addRoom("custom")
                
                R.id.add_sump -> ProjectManager.addSumpPump()
                R.id.add_discharge -> ProjectManager.addDischargeLine()
                R.id.add_interior_pipe -> ProjectManager.addInteriorPipe()
                R.id.add_stanchion -> ProjectManager.addStanchion()
                R.id.add_beam -> ProjectManager.addSupportBeam()

                R.id.add_door -> ProjectManager.addOpening("door")
                R.id.add_window -> ProjectManager.addOpening("window")
            }
            binding.drawerLayout.closeDrawer(GravityCompat.START)
            true
        }
    }

    private fun setupDetailsBottomSheet() {
        val bottomSheet = findViewById<View>(R.id.bottom_sheet_details)
        if (bottomSheet != null) {
            val behavior = BottomSheetBehavior.from(bottomSheet)
            val db = BottomSheetDetailsBinding.bind(bottomSheet)
            detailBinding = db

            ProjectManager.addListener {
                updateUIFromState(behavior)
            }
            
            db.editRoomName.addTextChangedListener { text ->
                if (!isUpdatingUI) {
                    ProjectManager.state.selectedRoomId?.let { id ->
                        ProjectManager.state.rooms.find { it.id == id }?.name = text.toString()
                        ProjectManager.notifyChanged()
                    }
                }
            }
            
            db.editRoomW.addTextChangedListener { text ->
                if (!isUpdatingUI) {
                    text.toString().toFloatOrNull()?.let { valW ->
                        ProjectManager.state.selectedRoomId?.let { id ->
                            ProjectManager.state.rooms.find { it.id == id }?.w = valW
                            ProjectManager.notifyChanged()
                        }
                    }
                }
            }

            db.editRoomL.addTextChangedListener { text ->
                if (!isUpdatingUI) {
                    text.toString().toFloatOrNull()?.let { valL ->
                        ProjectManager.state.selectedRoomId?.let { id ->
                            ProjectManager.state.rooms.find { it.id == id }?.l = valL
                            ProjectManager.notifyChanged()
                        }
                    }
                }
            }

            db.switchFoamBoard.setOnCheckedChangeListener { _, isChecked ->
                if (!isUpdatingUI) {
                    ProjectManager.state.selectedRoomId?.let { id ->
                        ProjectManager.state.rooms.find { it.id == id }?.foamBoard = isChecked
                        ProjectManager.notifyChanged()
                    }
                }
            }

            db.switchFloorStrap.setOnCheckedChangeListener { _, isChecked ->
                if (!isUpdatingUI) {
                    ProjectManager.state.selectedRoomId?.let { id ->
                        ProjectManager.state.rooms.find { it.id == id }?.floorPerimeterStrap = isChecked
                        ProjectManager.notifyChanged()
                    }
                }
            }

            db.editStrapsQty.addTextChangedListener { text ->
                if (!isUpdatingUI) {
                    text.toString().toIntOrNull()?.let { qty ->
                        ProjectManager.state.selectedRoomId?.let { id ->
                            ProjectManager.state.rooms.find { it.id == id }?.carbonStraps = qty
                            ProjectManager.notifyChanged()
                        }
                    }
                }
            }

            db.btnDeleteRoom.setOnClickListener {
                ProjectManager.deleteSelected()
            }
        }
    }

    private fun updateUIFromState(behavior: BottomSheetBehavior<View>) {
        val db = detailBinding ?: return
        isUpdatingUI = true
        val selectedId = ProjectManager.state.selectedRoomId
        if (selectedId != null) {
            val room = ProjectManager.state.rooms.find { it.id == selectedId }
            if (room != null) {
                db.roomEditLayout.visibility = View.VISIBLE
                db.noSelectionText.visibility = View.GONE
                db.detailTitle.text = room.name
                
                if (db.editRoomName.text.toString() != room.name) {
                    db.editRoomName.setText(room.name)
                }
                if (db.editRoomW.text.toString() != room.w.toString()) {
                    db.editRoomW.setText(room.w.toString())
                }
                if (db.editRoomL.text.toString() != room.l.toString()) {
                    db.editRoomL.setText(room.l.toString())
                }
                
                db.switchFoamBoard.isChecked = room.foamBoard
                db.switchFloorStrap.isChecked = room.floorPerimeterStrap
                if (db.editStrapsQty.text.toString() != room.carbonStraps.toString()) {
                    db.editStrapsQty.setText(room.carbonStraps.toString())
                }

                if (behavior.state == BottomSheetBehavior.STATE_HIDDEN || behavior.peekHeight == 0) {
                    behavior.peekHeight = 250
                    behavior.state = BottomSheetBehavior.STATE_COLLAPSED
                }
            }
        } else {
            db.roomEditLayout.visibility = View.GONE
            db.noSelectionText.visibility = View.VISIBLE
            db.detailTitle.text = getString(R.string.selection_details)
            behavior.state = BottomSheetBehavior.STATE_HIDDEN
            behavior.peekHeight = 0
        }

        var totalFloor = 0f
        var totalWall = 0f
        ProjectManager.state.rooms.forEach { r ->
            val estimates = Estimator.calculateRoomEstimates(r)
            totalFloor += estimates["floorArea"] ?: 0f
            totalWall += estimates["netWallArea"] ?: 0f
        }
        db.totalFloorArea.text = "%.1f sq ft".format(totalFloor)
        db.totalWallArea.text = "%.1f sq ft".format(totalWall)
        isUpdatingUI = false
    }

    private fun replaceFragment(fragment: Fragment) {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, fragment)
            .commit()
    }

    private fun checkCameraPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_CODE)
        }
    }

    override fun onPause() {
        super.onPause()
        ProjectManager.saveProject(this)
    }
}
