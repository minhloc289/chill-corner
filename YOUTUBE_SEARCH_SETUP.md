# YouTube Search Setup Guide

This guide will help you set up the Google Programmable Search Engine for YouTube video search in the Chill Room app.

## 🎯 Overview

The app now includes a YouTube search feature powered by Google Programmable Search Engine. Users can search for songs directly within the app instead of copying URLs from YouTube.

## 📋 Prerequisites

- A Google account
- 5 minutes of setup time

## 🚀 Setup Instructions

### Step 1: Create a Google Programmable Search Engine

1. **Visit**: https://programmablesearchengine.google.com/

2. **Sign in** with your Google account

3. **Click "Add"** to create a new search engine

4. **Configure the search engine:**
   - **Search engine name**: `YouTube Music Search` (or any name you prefer)
   - **What to search**: Select "Search specific sites or pages"
   - **Sites to search**: Enter `*.youtube.com/*`
   - **Language**: English (or your preferred language)

5. **Click "Create"**

### Step 2: Get Your Search Engine ID

1. After creation, you'll be redirected to the control panel
2. Click on **"Setup"** in the left sidebar (or "Overview")
3. Find the **"Search engine ID"** section
4. It looks like: `abc123def456:xyz`
5. **Copy this ID**

### Step 3: Add the ID to Your Environment

1. Open the file `.env.local` in the project root
2. Find the line: `VITE_GOOGLE_SEARCH_ENGINE_ID=`
3. Paste your Search Engine ID after the equals sign:
   ```
   VITE_GOOGLE_SEARCH_ENGINE_ID=abc123def456:xyz
   ```
4. Save the file

### Step 4: Restart the Dev Server

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## ✅ Verify It's Working

1. Open your app in the browser
2. Click **"Add Song"** button
3. You should see two tabs: **"Search YouTube"** and **"Paste URL"**
4. Click on **"Search YouTube"** tab
5. You should see a search box powered by Google
6. Try searching for "lofi beats"
7. Click on any result to add it to your queue!

## 🎨 Optional: Customize the Search Engine

You can customize the look and feel of the search results:

1. Go back to https://programmablesearchengine.google.com/
2. Select your search engine
3. Click **"Look and feel"** in the left sidebar
4. Customize:
   - **Theme**: Choose a theme (Classic, Minimalist, etc.)
   - **Colors**: Match your app's color scheme
   - **Layout**: Adjust result display
5. Save your changes

## 🔧 Troubleshooting

### Search box doesn't appear

**Check:**
- Is `VITE_GOOGLE_SEARCH_ENGINE_ID` set in `.env.local`?
- Did you restart the dev server after adding it?
- Open browser console (F12) - any errors?

**Solution:**
```bash
# Verify environment variable is loaded
echo $VITE_GOOGLE_SEARCH_ENGINE_ID

# Restart dev server
npm run dev
```

### Clicking results opens YouTube instead of adding to queue

**Check:**
- Browser console for JavaScript errors
- Make sure you're clicking on YouTube video results (not channels or playlists)

**Note:** The app automatically detects YouTube video URLs and adds them to the queue.

### "Search not configured" warning appears

**Check:**
- `.env.local` file exists
- `VITE_GOOGLE_SEARCH_ENGINE_ID` is not empty
- No extra spaces in the environment variable

### No results appear

**Check:**
- Your search query (try "music" or "song")
- Internet connection
- Google Custom Search may have daily limits (very high for free tier)

## 📊 Limitations

### Free Tier
- **Searches**: Unlimited on embedded search
- **Results**: Up to 10 per search
- **Ads**: May show Google ads (can be disabled with paid tier)

### Branding
- "Powered by Google" branding is required
- Can be styled but not removed

## 🎯 Features

✅ **Search YouTube directly** - No need to leave the app
✅ **One-click add** - Click any result to add to queue
✅ **Video thumbnails** - Visual preview of videos
✅ **Fast & accurate** - Powered by Google Search
✅ **Fallback option** - Can still paste URLs manually

## 🆘 Need Help?

If you encounter issues:

1. Check the browser console (F12) for errors
2. Verify your Search Engine ID is correct
3. Make sure `.env.local` is not committed to git
4. Try creating a new search engine and use that ID

## 🔐 Security Notes

- `.env.local` is in `.gitignore` - it won't be committed
- Your Search Engine ID is public (it's safe to expose)
- For production deployments, add the environment variable to your hosting platform's settings

## 📚 Additional Resources

- [Google Programmable Search Documentation](https://developers.google.com/custom-search)
- [Creating a Search Engine Guide](https://developers.google.com/custom-search/docs/tutorial/creatingcse)
- [Customizing Look and Feel](https://developers.google.com/custom-search/docs/tutorial/implementingsearchbox)

---

**Happy searching! 🎵**
