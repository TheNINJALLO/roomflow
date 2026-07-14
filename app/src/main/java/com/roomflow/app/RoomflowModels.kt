package com.roomflow.app

import java.util.UUID

data class Point2D(var x: Float = 0f, var y: Float = 0f)

data class Opening(
    val id: String = UUID.randomUUID().toString(),
    var type: String = "door",
    var wall: String = "n",
    var offset: Float = 0f,
    var w: Float = 3f,
    var h: Float = 6.8f
)

data class Room(
    val id: String = UUID.randomUUID().toString(),
    var name: String = "New Room",
    var type: String = "custom",
    var x: Float = 0f,
    var y: Float = 0f,
    var w: Float = 10f,
    var l: Float = 10f,
    var h: Float = 8f,
    var color: String = "#3b82f6",
    var levelId: String = "basement",
    var openings: MutableList<Opening> = mutableListOf(),
    var vertices: MutableList<Point2D>? = null,
    var foamBoard: Boolean = false,
    var carbonStraps: Int = 0,
    var floorPerimeterStrap: Boolean = false,
    var nb1Height: String = "none",
    var joists: String = "none",
    var steps: Int? = null,
    var stairOrientation: String? = null,
    var stairDirection: String? = null
)

data class SumpPump(
    val id: String = UUID.randomUUID().toString(),
    var name: String = "Sump Pump",
    var x: Float = 0f,
    var y: Float = 0f,
    var levelId: String = "basement"
)

data class DischargeLine(
    val id: String = UUID.randomUUID().toString(),
    var label: String = "Discharge",
    var x1: Float = 0f,
    var y1: Float = 0f,
    var x2: Float = 0f,
    var y2: Float = 0f,
    var length: Float = 0f,
    var levelId: String = "basement"
)

data class InteriorPipe(
    val id: String = UUID.randomUUID().toString(),
    var label: String = "Pipe",
    var x1: Float = 0f,
    var y1: Float = 0f,
    var x2: Float = 0f,
    var y2: Float = 0f,
    var length: Float = 0f,
    var levelId: String = "basement"
)

data class Stanchion(
    val id: String = UUID.randomUUID().toString(),
    var name: String = "Stanchion",
    var x: Float = 0f,
    var y: Float = 0f,
    var type: String = "round",
    var levelId: String = "basement"
)

data class SupportBeam(
    val id: String = UUID.randomUUID().toString(),
    var label: String = "Beam",
    var x1: Float = 0f,
    var y1: Float = 0f,
    var x2: Float = 0f,
    var y2: Float = 0f,
    var length: Float = 0f,
    var type: String = "timber",
    var levelId: String = "basement"
)

data class ProjectState(
    var customerName: String = "",
    var customerAddress: String = "",
    var rooms: MutableList<Room> = mutableListOf(),
    var sumpPumps: MutableList<SumpPump> = mutableListOf(),
    var dischargeLines: MutableList<DischargeLine> = mutableListOf(),
    var interiorPipes: MutableList<InteriorPipe> = mutableListOf(),
    var stanchions: MutableList<Stanchion> = mutableListOf(),
    var supportBeams: MutableList<SupportBeam> = mutableListOf(),
    var currentLevelId: String = "basement",
    var selectedRoomId: String? = null
)
