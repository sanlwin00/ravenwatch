from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.models.entity import EntityCreate, EntityUpdate
from app.services import entity_service

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("", status_code=status.HTTP_200_OK)
async def list_entities(db=Depends(get_db)):
    """List all entities sorted by tier (1 first), then name."""
    return await entity_service.get_all_entities(db)


@router.get("/{entity_id}", status_code=status.HTTP_200_OK)
async def get_entity(entity_id: str, db=Depends(get_db)):
    """Get a single entity by ID."""
    entity = await entity_service.get_entity(db, entity_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
    return entity


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_entity(body: EntityCreate, db=Depends(get_db)):
    """Create a new entity."""
    return await entity_service.create_entity(db, body.model_dump())


@router.put("/{entity_id}", status_code=status.HTTP_200_OK)
async def update_entity(entity_id: str, body: EntityUpdate, db=Depends(get_db)):
    """Update an existing entity."""
    entity = await entity_service.update_entity(db, entity_id, body.model_dump())
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
    return entity


@router.delete("/{entity_id}", status_code=status.HTTP_200_OK)
async def delete_entity(entity_id: str, db=Depends(get_db)):
    """Delete an entity by ID."""
    deleted = await entity_service.delete_entity(db, entity_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
    return {"deleted": True, "id": entity_id}


@router.post("/seed", status_code=status.HTTP_200_OK)
async def seed_entities(db=Depends(get_db)):
    """Seed the default entity watchlist. Idempotent."""
    count = await entity_service.seed_entities(db)
    return {"seeded": count}
