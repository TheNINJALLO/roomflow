package com.roomflow.app

import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.view.HapticFeedbackConstants
import kotlin.math.*

class SketchCanvasView(context: Context, attrs: AttributeSet?) : View(context, attrs) {

    private val roomPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val outlinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = Color.WHITE
    }
    private val gridPaint = Paint().apply {
        color = Color.parseColor("#15ffffff")
        strokeWidth = 1f
    }
    private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = Color.parseColor("#00ffd1")
    }
    private val hoverPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f
        color = Color.parseColor("#00ffd1")
        pathEffect = DashPathEffect(floatArrayOf(10f, 10f), 0f)
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 24f
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private var scale = 25f
    private var offsetX = 0f
    private var offsetY = 0f
    private val snapGridSize = 0.5f

    private var draggedRoomId: String? = null
    private var dragHandle: String? = null
    private var lastX = 0f
    private var lastY = 0f
    private var hoverX = -1f
    private var hoverY = -1f
    private var initialViewConfigured = false

    init {
        ProjectManager.addListener { postInvalidate() }
        
        setOnHoverListener { _, event ->
            if (event.action == MotionEvent.ACTION_HOVER_MOVE) {
                hoverX = event.x
                hoverY = event.y
                invalidate()
                true
            } else {
                hoverX = -1f
                hoverY = -1f
                invalidate()
                false
            }
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (!initialViewConfigured && w > 0) {
            scale = w / 30f // Initial zoom level
            offsetX = 0f
            offsetY = 0f
            initialViewConfigured = true
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(Color.parseColor("#0a0d14"))

        drawGrid(canvas)
        
        if (hoverX != -1f) {
            canvas.drawCircle(hoverX, hoverY, 40f, hoverPaint)
        }

        val centerX = width / 2f
        val centerY = height / 2f

        ProjectManager.state.rooms.forEach { room ->
            if (room.levelId != ProjectManager.state.currentLevelId) return@forEach

            val left = centerX + offsetX + room.x * scale
            val top = centerY + offsetY + room.y * scale
            val right = left + room.w * scale
            val bottom = top + room.l * scale

            try {
                roomPaint.color = Color.parseColor(room.color)
            } catch (e: Exception) {
                roomPaint.color = Color.BLUE
            }
            roomPaint.alpha = 40
            canvas.drawRect(left, top, right, bottom, roomPaint)

            val isSelected = room.id == ProjectManager.state.selectedRoomId
            outlinePaint.color = if (isSelected) Color.parseColor("#00ffd1") else Color.parseColor("#33ffffff")
            outlinePaint.strokeWidth = if (isSelected) 5f else 2f
            canvas.drawRect(left, top, right, bottom, outlinePaint)

            canvas.drawText(room.name, (left + right) / 2f, (top + bottom) / 2f, textPaint)
            textPaint.textSize = 18f
            canvas.drawText("${room.w}' x ${room.l}'", (left + right) / 2f, (top + bottom) / 2f + 25f, textPaint)
            textPaint.textSize = 24f

            drawWallMeasurements(canvas, left, top, right, bottom, room)

            if (isSelected) {
                drawResizeHandles(canvas, left, top, right, bottom)
            }
        }

        // Draw Utilities
        ProjectManager.state.sumpPumps.forEach { sp ->
            if (sp.levelId != ProjectManager.state.currentLevelId) return@forEach
            val cx = centerX + offsetX + sp.x * scale
            val cy = centerY + offsetY + sp.y * scale
            roomPaint.color = Color.parseColor("#f59e0b")
            roomPaint.alpha = 255
            canvas.drawCircle(cx, cy, 15f, roomPaint)
            textPaint.textSize = 14f
            canvas.drawText("SP", cx, cy + 5f, textPaint)
        }
    }

    private fun drawGrid(canvas: Canvas) {
        val step = scale
        val startX = (offsetX % step) + (width / 2f % step)
        val startY = (offsetY % step) + (height / 2f % step)

        var x = startX
        while (x < width) {
            canvas.drawLine(x, 0f, x, height.toFloat(), gridPaint)
            x += step
        }
        var y = startY
        while (y < height) {
            canvas.drawLine(0f, y, width.toFloat(), y, gridPaint)
            y += step
        }
    }

    private fun drawWallMeasurements(canvas: Canvas, l: Float, t: Float, r: Float, b: Float, room: Room) {
        val paint = Paint(textPaint).apply { textSize = 16f; color = Color.parseColor("#9ca3af") }
        canvas.drawText("${room.w} ft", (l + r) / 2f, t - 10f, paint)
        canvas.drawText("${room.w} ft", (l + r) / 2f, b + 20f, paint)
        
        canvas.save()
        canvas.rotate(-90f, l - 15f, (t + b) / 2f)
        canvas.drawText("${room.l} ft", l - 15f, (t + b) / 2f, paint)
        canvas.restore()

        canvas.save()
        canvas.rotate(90f, r + 15f, (t + b) / 2f)
        canvas.drawText("${room.l} ft", r + 15f, (t + b) / 2f, paint)
        canvas.restore()
    }

    private fun drawResizeHandles(canvas: Canvas, l: Float, t: Float, r: Float, b: Float) {
        val size = 18f // Larger handles for S24 Ultra resolution
        handlePaint.color = Color.parseColor("#00ffd1")
        canvas.drawRect(l - size, t - size, l + size, t + size, handlePaint) // NW
        canvas.drawRect(r - size, t - size, r + size, t + size, handlePaint) // NE
        canvas.drawRect(r - size, b - size, r + size, b + size, handlePaint) // SE
        canvas.drawRect(l - size, b - size, l + size, b + size, handlePaint) // SW
        
        handlePaint.color = Color.parseColor("#3b82f6")
        canvas.drawRect((l + r) / 2f - size, t - size, (l + r) / 2f + size, t + size, handlePaint) // N
        canvas.drawRect((l + r) / 2f - size, b - size, (l + r) / 2f + size, b + size, handlePaint) // S
        canvas.drawRect(l - size, (t + b) / 2f - size, l + size, (t + b) / 2f + size, handlePaint) // W
        canvas.drawRect(r - size, (t + b) / 2f - size, r + size, (t + b) / 2f + size, handlePaint) // E
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x
                lastY = event.y
                val hit = findHit(event.x, event.y)
                if (hit != null) {
                    ProjectManager.state.selectedRoomId = hit.first
                    draggedRoomId = hit.first
                    dragHandle = hit.second
                    invalidate()
                } else {
                    ProjectManager.state.selectedRoomId = null
                    draggedRoomId = null
                    dragHandle = null
                    invalidate()
                }
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - lastX
                val dy = event.y - lastY
                if (draggedRoomId != null) {
                    val room = ProjectManager.state.rooms.find { it.id == draggedRoomId }!!
                    updateRoomGeometry(room, dx / scale, dy / scale)
                } else {
                    offsetX += dx
                    offsetY += dy
                }
                lastX = event.x
                lastY = event.y
                invalidate()
            }
            MotionEvent.ACTION_UP -> {
                draggedRoomId = null
                dragHandle = null
                performClick()
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    private fun findHit(x: Float, y: Float): Pair<String, String>? {
        val centerX = width / 2f
        val centerY = height / 2f
        val handleTolerance = 60f // Better for high-res screens

        ProjectManager.state.selectedRoomId?.let { id ->
            val room = ProjectManager.state.rooms.find { it.id == id }!!
            val l = centerX + offsetX + room.x * scale
            val t = centerY + offsetY + room.y * scale
            val r = l + room.w * scale
            val b = t + room.l * scale

            if (dist(x, y, l, t) < handleTolerance) return id to "nw"
            if (dist(x, y, r, t) < handleTolerance) return id to "ne"
            if (dist(x, y, r, b) < handleTolerance) return id to "se"
            if (dist(x, y, l, b) < handleTolerance) return id to "sw"
            if (dist(x, y, (l + r) / 2f, t) < handleTolerance) return id to "n"
            if (dist(x, y, (l + r) / 2f, b) < handleTolerance) return id to "s"
            if (dist(x, y, l, (t + b) / 2f) < handleTolerance) return id to "w"
            if (dist(x, y, r, (t + b) / 2f) < handleTolerance) return id to "e"
        }

        ProjectManager.state.rooms.reversed().forEach { room ->
            if (room.levelId != ProjectManager.state.currentLevelId) return@forEach
            val l = centerX + offsetX + room.x * scale
            val t = centerY + offsetY + room.y * scale
            val r = l + room.w * scale
            val b = t + room.l * scale
            if (x in l..r && y in t..b) return room.id to "move"
        }
        return null
    }

    private fun updateRoomGeometry(room: Room, dx: Float, dy: Float) {
        when (dragHandle) {
            "move" -> {
                room.x = snap(room.x + dx)
                room.y = snap(room.y + dy)
            }
            "e" -> room.w = max(1f, snap(room.w + dx))
            "s" -> room.l = max(1f, snap(room.l + dy))
            "w" -> {
                val oldRight = room.x + room.w
                room.x = min(oldRight - 1f, snap(room.x + dx))
                room.w = oldRight - room.x
            }
            "n" -> {
                val oldBottom = room.y + room.l
                room.y = min(oldBottom - 1f, snap(room.y + dy))
                room.l = oldBottom - room.y
            }
            "se" -> {
                room.w = max(1f, snap(room.w + dx))
                room.l = max(1f, snap(room.l + dy))
            }
            "nw" -> {
                val oldRight = room.x + room.w
                val oldBottom = room.y + room.l
                room.x = min(oldRight - 1f, snap(room.x + dx))
                room.y = min(oldBottom - 1f, snap(room.y + dy))
                room.w = oldRight - room.x
                room.l = oldBottom - room.y
            }
            "ne" -> {
                val oldBottom = room.y + room.l
                room.w = max(1f, snap(room.w + dx))
                room.y = min(oldBottom - 1f, snap(room.y + dy))
                room.l = oldBottom - room.y
            }
            "sw" -> {
                val oldRight = room.x + room.w
                room.x = min(oldRight - 1f, snap(room.x + dx))
                room.w = oldRight - room.x
                room.l = max(1f, snap(room.l + dy))
            }
        }
    }

    private fun snap(v: Float): Float {
        val snapped = round(v / snapGridSize) * snapGridSize
        if (abs(snapped - v) > 0.01f && abs(snapped - v) < 0.1f) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                performHapticFeedback(HapticFeedbackConstants.SEGMENT_TICK)
            } else {
                performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            }
        }
        return snapped
    }

    private fun dist(x1: Float, y1: Float, x2: Float, y2: Float) = sqrt((x1-x2).pow(2) + (y1-y2).pow(2))
}
