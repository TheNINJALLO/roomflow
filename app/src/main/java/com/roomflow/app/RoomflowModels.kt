package com.roomflow.app

import java.util.UUID

data class Point2D(var x: Float, var y: Float)

data class Opening(
    val id: String = UUID.randomUUID().toString(),
    var type: String, // "door" or "window"
    var wall: String, // "n", "e", "s", "w" or index for custom
    var offset: Float,
    var w: Float,
    var h: Float
)

data class Room(
    val id: String = UUID.randomUUID().toString(),
    var name: String,
    var type: String, // "living", "bedroom", etc.
    var x: Float,
    var y: Float,
    var w: Float,
    var l: Float,
    var h: Float,
    var color: String,
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
    var name: String,
    var x: Float,
    var y: Float,
    var levelId: String = "basement"
)

data class DischargeLine(
    val id: String = UUID.randomUUID().toString(),
    var label: String,
    var x1: Float,
    var y1: Float,
    var x2: Float,
    var y2: Float,
    var length: Float,
    var levelId: String = "basement"
)

data class ProjectState(
    var rooms: MutableList<Room> = mutableListOf(),
    var sumpPumps: MutableList<SumpPump> = mutableListOf(),
    var dischargeLines: MutableList<DischargeLine> = mutableListOf(),
    var currentLevelId: String = "basement"
)
