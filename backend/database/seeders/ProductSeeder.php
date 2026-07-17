<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $products = [
            [
                'name' => 'Quantum Smartwatch',
                'description' => 'A next-generation smartwatch featuring solar charging, modular sensors, and real-time health analytics.',
                'price' => 299.99,
                'image' => 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Echo Noise-Cancelling Headphones',
                'description' => 'Premium over-ear headphones with hybrid active noise cancellation and a 50-hour battery life.',
                'price' => 199.99,
                'image' => 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Aero Ergonomic Keyboard',
                'description' => 'Split wireless ergonomic mechanical keyboard with custom low-profile switches and RGB backlight.',
                'price' => 149.50,
                'image' => 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Lumina Desk Lamp',
                'description' => 'Smart ambient desk lamp with adjustable color temperature, wireless phone charger, and auto-dimming.',
                'price' => 79.99,
                'image' => 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Apex Wireless Mouse',
                'description' => 'Ultra-lightweight gaming mouse with a 26K DPI optical sensor and 100-hour rechargeable battery.',
                'price' => 89.99,
                'image' => 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Nexus Portable SSD 1TB',
                'description' => 'High-speed external solid state drive with up to 2000MB/s read/write speed and rugged design.',
                'price' => 120.00,
                'image' => 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Solar Charge Bank 20K',
                'description' => 'Rugged 20,000mAh external battery power bank with solar panels and dual USB-C Power Delivery.',
                'price' => 49.99,
                'image' => 'https://images.unsplash.com/photo-1609592424109-dd9892f1b17c?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Vortex Smart Bottle',
                'description' => 'Self-cleaning vacuum insulated stainless steel water bottle with built-in UV-C water purification.',
                'price' => 59.95,
                'image' => 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Zenith Minimalist Backpack',
                'description' => 'Waterproof travel and commuter backpack with hidden pockets and an integrated laptop sleeve.',
                'price' => 110.00,
                'image' => 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&auto=format&fit=crop&q=80',
            ],
            [
                'name' => 'Nova Desktop Microphone',
                'description' => 'Studio-grade USB cardioid condenser microphone for streaming, podcasting, and voiceover work.',
                'price' => 129.99,
                'image' => 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=500&auto=format&fit=crop&q=80',
            ],
        ];

        foreach ($products as $p) {
            \App\Models\Product::create($p);
        }
    }
}
