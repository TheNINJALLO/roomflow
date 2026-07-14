package com.roomflow.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.google.gson.Gson
import com.google.gson.GsonBuilder

object ProjectManager {
    var state = ProjectState()
    private val listeners = mutableListOf<() -> Unit>()
    private val gson: Gson = GsonBuilder().create()
    private val mainHandler = Handler(Looper.getMainLooper())
    
    fun addListener(listener: () -> Unit) {
        listeners.add(listener)
    }
    
    fun notifyChanged() {
        mainHandler.post {
            listeners.forEach { it() }
        }
    }

    private fun ensureListsInitialized(s: ProjectState) {
        if (s.rooms == null) s.rooms = mutableListOf()
        if (s.sumpPumps == null) s.sumpPumps = mutableListOf()
        if (s.dischargeLines == null) s.dischargeLines = mutableListOf()
        if (s.interiorPipes == null) s.interiorPipes = mutableListOf()
        if (s.stanchions == null) s.stanchions = mutableListOf()
        if (s.supportBeams == null) s.supportBeams = mutableListOf()
        
        s.rooms.forEach { room ->
            if (room.openings == null) room.openings = mutableListOf()
        }
    }

    fun addRoom(type: String) {
        val room = when(type) {
            "living" -> Room(name = "Living Room", type = type, w = 16f, l = 20f, color = "#3b82f6")
            "bedroom" -> Room(name = "Bedroom", type = type, w = 12f, l = 14f, color = "#8b5cf6")
            "kitchen" -> Room(name = "Kitchen", type = type, w = 12f, l = 12f, color = "#10b981")
            "bathroom" -> Room(name = "Bathroom", type = type, w = 8f, l = 8f, color = "#f59e0b")
            "hallway" -> Room(name = "Hallway", type = type, w = 4f, l = 16f, color = "#6b7280")
            "closet" -> Room(name = "Closet", type = type, w = 4f, l = 6f, color = "#10b981")
            "staircase" -> Room(name = "Staircase", type = type, w = 3.5f, l = 12f, color = "#f43f5e", steps = 12, stairOrientation = "N", stairDirection = "up")
            else -> Room(name = "Custom Room", type = "custom", w = 10f, l = 10f, color = "#ec4899")
        }
        room.levelId = state.currentLevelId
        state.rooms.add(room)
        state.selectedRoomId = room.id
        notifyChanged()
    }

    fun addSumpPump() {
        state.sumpPumps.add(SumpPump(name = "Sump Pump ${state.sumpPumps.size + 1}", levelId = state.currentLevelId))
        notifyChanged()
    }

    fun addDischargeLine() {
        state.dischargeLines.add(DischargeLine(label = "Discharge ${state.dischargeLines.size + 1}", x1 = -3f, x2 = 3f, length = 6f, levelId = state.currentLevelId))
        notifyChanged()
    }

    fun addInteriorPipe() {
        state.interiorPipes.add(InteriorPipe(label = "Pipe ${state.interiorPipes.size + 1}", x1 = -2f, x2 = 2f, length = 4f, levelId = state.currentLevelId))
        notifyChanged()
    }

    fun addStanchion() {
        state.stanchions.add(Stanchion(name = "Stanchion ${state.stanchions.size + 1}", levelId = state.currentLevelId))
        notifyChanged()
    }

    fun addSupportBeam() {
        state.supportBeams.add(SupportBeam(label = "Beam ${state.supportBeams.size + 1}", x1 = -3f, x2 = 3f, length = 6f, levelId = state.currentLevelId))
        notifyChanged()
    }

    fun addOpening(type: String) {
        state.selectedRoomId?.let { roomId ->
            state.rooms.find { it.id == roomId }?.let { room ->
                room.openings.add(Opening(
                    type = type,
                    wall = "n",
                    offset = room.w / 2f,
                    w = if (type == "door") 3f else 4f,
                    h = if (type == "door") 6.8f else 4f
                ))
                notifyChanged()
            }
        }
    }

    fun deleteSelected() {
        state.selectedRoomId?.let { id ->
            state.rooms.removeAll { it.id == id }
            state.selectedRoomId = null
            notifyChanged()
        }
    }

    fun saveProject(context: Context) {
        try {
            val json = gson.toJson(state)
            context.openFileOutput("roomflow_v3.json", Context.MODE_PRIVATE).use {
                it.write(json.toByteArray())
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun loadProject(context: Context) {
        try {
            val file = context.getFileStreamPath("roomflow_v3.json")
            if (file.exists()) {
                val json = file.readText()
                val loadedState = gson.fromJson(json, ProjectState::class.java)
                if (loadedState != null) {
                    ensureListsInitialized(loadedState)
                    state = loadedState
                    notifyChanged()
                }
            }
        } catch (e: Exception) {
            // If v3 fails, try to clear and start fresh to avoid death-loop
            state = ProjectState()
            notifyChanged()
        }
    }

    fun clear() {
        state = ProjectState()
        notifyChanged()
    }
}
