package com.roomflow.app

object ProjectManager {
    var state = ProjectState()
    
    // Listeners for UI updates
    private val listeners = mutableListOf<() -> Unit>()
    
    fun addListener(listener: () -> Unit) {
        listeners.add(listener)
    }
    
    fun notifyChanged() {
        listeners.forEach { it() }
    }

    fun addRoom(room: Room) {
        state.rooms.add(room)
        notifyChanged()
    }

    fun clear() {
        state = ProjectState()
        notifyChanged()
    }
}
