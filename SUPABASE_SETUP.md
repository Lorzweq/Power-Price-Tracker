# Supabase Setup Guide

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Create a new project
3. Wait for project to finish setting up

## 2. Get Your API Keys

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the **Project URL** (e.g., `https://xxxxx.supabase.co`)
3. Copy the **anon/public** key

## 3. Update index.html

In `docs/index.html`, find these lines (around line 550):

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your Supabase anon key
```

Replace them with your actual values:

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

## 4. Create Database Table

In Supabase dashboard, go to **SQL Editor** and run this query:

```sql
-- Create premium_users table
CREATE TABLE premium_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  device_id TEXT NOT NULL,
  premium_key TEXT NOT NULL,
  is_premium BOOLEAN DEFAULT true,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE premium_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own premium status
CREATE POLICY "Users can read own premium status"
  ON premium_users
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own premium activation
CREATE POLICY "Users can insert own premium status"
  ON premium_users
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own premium status
CREATE POLICY "Users can update own premium status"
  ON premium_users
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_premium_users_user_id ON premium_users(user_id);
```

## 5. Configure Email Authentication

1. Go to **Authentication** → **Providers**
2. Enable **Email** provider
3. Configure email templates if desired
4. For testing, you can disable email confirmation in **Settings** → **Authentication** → **Email Auth**

## 6. Test the Integration

1. Open your app (https://lorzweq.github.io)
2. Expand the Price Watch section
3. You should see login/signup fields
4. Try creating an account
5. Activate premium with one of the keys:
   - PREM-8K9L-M3N7-Q2R5-X4W8
   - PWAT-7H2J-F9D6-C5V1-B8N3
   - ELEC-4T3Y-G8K2-P7M9-L6H5
   - (etc.)

## Features

- **User Authentication**: Users can sign up/login with email & password
- **Premium Status**: Stored in Supabase database
- **Device Tracking**: Each activation is tied to a device ID
- **Fallback**: If Supabase is not configured, uses localStorage

## Security Notes

- Never commit your Supabase keys to GitHub
- Use environment variables for production
- The anon key is safe to expose in client-side code (it's read-only by default)
- Row Level Security ensures users can only access their own data
