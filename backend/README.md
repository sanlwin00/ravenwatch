# RavenWatch Backend

FastAPI backend for the RavenWatch OSINT platform.

## Setup

1. Create and activate a virtual environment:
   ```bash
   cd backend && python -m venv venv && source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env and fill in all values
   ```

4. Run the database schema:
   - Open your Supabase project → SQL Editor
   - Paste the contents of `schema/init.sql` and run it

5. Start the development server:
   ```bash
   uvicorn app.main:app --reload
   ```

API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.
