<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class ApiController extends Controller
{
    public function getProducts()
    {
        return response()->json(\App\Models\Product::all());
    }

    public function getOrders()
    {
        return response()->json(\App\Models\Order::with('product')->get());
    }

    public function createOrder(Request $request)
    {
        $validated = $request->validate([
            'orders' => 'required|array',
            'orders.*.product_id' => 'required|exists:products,id',
            'orders.*.quantity' => 'required|integer|min:1',
            'customer_name' => 'required|string|max:255',
            'customer_email' => 'required|email|max:255',
        ]);

        $createdOrders = [];
        foreach ($validated['orders'] as $orderData) {
            $order = \App\Models\Order::create([
                'product_id' => $orderData['product_id'],
                'quantity' => $orderData['quantity'],
                'customer_name' => $validated['customer_name'],
                'customer_email' => $validated['customer_email'],
                'status' => 'completed',
            ]);
            $createdOrders[] = $order;
        }

        return response()->json([
            'message' => 'Order created successfully',
            'orders' => $createdOrders
        ], 201);
    }
}
