package com.roomflow.app

import kotlin.math.abs

object Estimator {

    fun calculateRoomEstimates(room: Room): Map<String, Float> {
        val floorArea = if (room.vertices != null && room.vertices!!.size >= 3) {
            getPolygonArea(room.vertices!!)
        } else {
            room.w * room.l
        }

        val perimeter = if (room.vertices != null && room.vertices!!.size >= 3) {
            getPolygonPerimeter(room.vertices!!)
        } else {
            2 * (room.w + room.l)
        }

        val grossWallArea = perimeter * room.h
        var deductions = 0f
        room.openings.forEach { deductions += it.w * it.h }
        
        val netWallArea = (grossWallArea - deductions).coerceAtLeast(0f)
        val volume = floorArea * room.h

        return mapOf(
            "floorArea" to floorArea,
            "netWallArea" to netWallArea,
            "perimeter" to perimeter,
            "volume" to volume
        )
    }

    private fun getPolygonArea(vertices: List<Point2D>): Float {
        var area = 0f
        for (i in vertices.indices) {
            val v1 = vertices[i]
            val v2 = vertices[(i + 1) % vertices.size]
            area += v1.x * v2.y - v2.x * v1.y
        }
        return abs(area / 2f)
    }

    private fun getPolygonPerimeter(vertices: List<Point2D>): Float {
        var perimeter = 0f
        for (i in vertices.indices) {
            val v1 = vertices[i]
            val v2 = vertices[(i + 1) % vertices.size]
            perimeter += kotlin.math.sqrt((v2.x - v1.x) * (v2.x - v1.x) + (v2.y - v1.y) * (v2.y - v1.y))
        }
        return perimeter
    }
}
