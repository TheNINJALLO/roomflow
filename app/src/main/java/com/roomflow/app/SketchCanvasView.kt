package com.roomflow.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View

class SketchCanvasView(context: Context, attrs: AttributeSet?) : View(context, attrs) {

    private val roomPaint = Paint().apply {
        style = Paint.Style.FILL
    }
    private val outlinePaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = Color.WHITE
    }
    private val textPaint = Paint().apply {
        color = Color.WHITE
        textSize = 30f
        textAlign = Paint.Align.CENTER
    }

    private var scale = 20f
    private var offsetX = 0f
    private var offsetY = 0f

    init {
        ProjectManager.addListener {
            invalidate()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val centerX = width / 2f
        val centerY = height / 2f

        ProjectManager.state.rooms.forEach { room ->
            val left = centerX + offsetX + room.x * scale
            val top = centerY + offsetY + room.y * scale
            val right = left + room.w * scale
            val bottom = top + room.l * scale

            roomPaint.color = Color.parseColor(room.color)
            roomPaint.alpha = 40
            canvas.drawRect(left, top, right, bottom, roomPaint)

            canvas.drawRect(left, top, right, bottom, outlinePaint)
            
            canvas.drawText(room.name, (left + right) / 2f, (top + bottom) / 2f, textPaint)
        }
    }

    private var lastX = 0f
    private var lastY = 0f

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x
                lastY = event.y
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.x - lastX
                val dy = event.y - lastY
                offsetX += dx
                offsetY += dy
                lastX = event.x
                lastY = event.y
                invalidate()
            }
        }
        return true
    }
}
