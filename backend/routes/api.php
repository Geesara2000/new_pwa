<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\ApiController;

Route::get('/products', [ApiController::class, 'getProducts']);
Route::get('/orders', [ApiController::class, 'getOrders']);
Route::post('/orders', [ApiController::class, 'createOrder']);
