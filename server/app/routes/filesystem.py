from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
import os
import yaml
import shutil
import httpx
import json
import csv
from io import StringIO
from pathlib import Path
from server.app.models import PipelineConfigRequest
from server.app.deps import get_db
from server.app.models import NamespaceRole
from server.app.security import (
    CurrentUser,
    assert_namespace_role,
    get_current_user,
    require_namespace_role,
    resolve_docetl_namespace_for_path,
    validate_namespace,
)

router = APIRouter()

def _authorize_namespace(
    *,
    conn,
    current_user: CurrentUser,
    namespace: str,
    min_role: NamespaceRole,
) -> str:
    namespace_value = validate_namespace(namespace)
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=namespace_value,
        min_role=min_role,
    )
    return namespace_value


def _authorize_docetl_path(
    *,
    conn,
    current_user: CurrentUser,
    path: str,
    min_role: NamespaceRole,
) -> Path:
    namespace, resolved = resolve_docetl_namespace_for_path(path)
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=namespace,
        min_role=min_role,
    )
    return resolved


def _validate_pipeline_name_for_paths(name: str) -> None:
    if not name:
        raise HTTPException(status_code=400, detail="Pipeline name is required")
    if any(token in name for token in ("..", "/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid pipeline name")


def get_home_dir() -> str:
    """Get the home directory from env var or user home"""
    return os.getenv("DOCETL_HOME_DIR", os.path.expanduser("~"))

def get_namespace_dir(namespace: str) -> Path:
    """Get the namespace directory path"""
    home_dir = get_home_dir()
    return Path(home_dir) / ".docetl" / namespace

@router.post("/check-namespace")
async def check_namespace(
    namespace: str,
    ctx: tuple[CurrentUser, str, NamespaceRole] = Depends(
        require_namespace_role(min_role=NamespaceRole.VIEWER)
    ),
):
    """Check if namespace exists and create if it doesn't"""
    try:
        _, namespace_value, _ = ctx
        namespace_dir = get_namespace_dir(namespace_value)
        exists = namespace_dir.exists()
        
        if not exists:
            namespace_dir.mkdir(parents=True, exist_ok=True)
            
        return {"exists": exists}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to check/create namespace: {str(e)}")

def validate_json_content(content: bytes) -> None:
    """Validate that content can be parsed as JSON"""
    try:
        json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format: {str(e)}")

def convert_csv_to_json(csv_content: bytes) -> bytes:
    """Convert CSV content to JSON format"""
    try:
        # Decode bytes to string and create a StringIO object
        csv_string = csv_content.decode('utf-8')
        csv_file = StringIO(csv_string)
        
        # Read CSV and convert to list of dictionaries
        reader = csv.DictReader(csv_file)
        data = list(reader)
        
        if not data:
            raise HTTPException(status_code=400, detail="CSV file is empty")
            
        # Convert back to JSON bytes
        return json.dumps(data).encode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Invalid CSV encoding")
    except csv.Error as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV format: {str(e)}")

def is_likely_csv(content: bytes, filename: str) -> bool:
    """Check if content is likely to be CSV based on content and filename"""
    # Check filename extension
    if filename.lower().endswith('.csv'):
        return True
        
    # If no clear extension, try to detect CSV content
    try:
        # Take first line and check if it looks like CSV
        first_line = content.split(b'\n')[0].decode('utf-8')
        # Check if line contains commas and no obvious JSON characters
        return ',' in first_line and not any(c in first_line for c in '{}[]')
    except:
        return False

@router.post("/upload-file")
async def upload_file(
    file: UploadFile | None = File(None),
    url: str | None = Form(None),
    namespace: str = Form(...),
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Upload a file to the namespace files directory, either from a direct upload or a URL"""
    try:
        namespace_value = _authorize_namespace(
            conn=conn,
            current_user=current_user,
            namespace=namespace,
            min_role=NamespaceRole.EDITOR,
        )
        if not file and not url:
            raise HTTPException(status_code=400, detail="Either file or url must be provided")
            
        upload_dir = get_namespace_dir(namespace_value) / "files"
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        if url:
            # Get filename from URL or default to dataset.json
            filename = url.split("/")[-1].split("?")[0] or "dataset.json"
            filename = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)
            
            file_path = upload_dir / filename.replace('.csv', '.json')
            
            # Handle URL download
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    'GET',
                    url,
                    follow_redirects=True,
                ) as response:
                    if response.status_code != 200:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Failed to download from URL: {response.status_code}"
                        )
                    
                    # Save the file in chunks
                    content_chunks = []
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        if chunk:  # filter out keep-alive new chunks
                            content_chunks.append(chunk)
                    
                    # Combine chunks
                    content = b''.join(content_chunks)
                    
                    # Check if content is CSV and convert if needed
                    if is_likely_csv(content, filename):
                        try:
                            content = convert_csv_to_json(content)
                        except HTTPException as e:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Failed to convert CSV to JSON: {str(e.detail)}"
                            )
                    
                    # Validate JSON content
                    validate_json_content(content)
                    
                    # Write to file
                    with file_path.open("wb") as f:
                        f.write(content)
        else:
            # Handle direct file upload
            file_content = await file.read()
            safe_filename = "".join(
                c if c.isalnum() or c in "._-" else "_" for c in (file.filename or "dataset.json")
            )
            
            # Check if content is CSV and convert if needed
            if safe_filename.lower().endswith('.csv'):
                try:
                    file_content = convert_csv_to_json(file_content)
                except HTTPException as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to convert CSV to JSON: {str(e.detail)}"
                    )
            
            # Validate JSON content
            validate_json_content(file_content)
            
            # Always save as .json
            file_path = upload_dir / safe_filename.replace(".csv", ".json")
            with file_path.open("wb") as f:
                f.write(file_content)
            
        return {"path": str(file_path)}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@router.post("/save-documents")
async def save_documents(
    files: list[UploadFile] = File(...),
    namespace: str = Form(...),
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Save multiple documents to the namespace documents directory"""
    try:
        namespace_value = _authorize_namespace(
            conn=conn,
            current_user=current_user,
            namespace=namespace,
            min_role=NamespaceRole.EDITOR,
        )
        uploads_dir = get_namespace_dir(namespace_value) / "documents"
        uploads_dir.mkdir(parents=True, exist_ok=True)
        
        saved_files = []
        for file in files:
            # Create safe filename
            safe_name = "".join(c if c.isalnum() or c in ".-" else "_" for c in file.filename)
            file_path = uploads_dir / safe_name
            
            with file_path.open("wb") as f:
                shutil.copyfileobj(file.file, f)
                
            saved_files.append({
                "name": file.filename,
                "path": str(file_path)
            })
            
        return {"files": saved_files}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to save documents: {str(e)}")

@router.post("/write-pipeline-config")
async def write_pipeline_config(
    request: PipelineConfigRequest,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Write pipeline configuration YAML file"""
    try:
        namespace_value = _authorize_namespace(
            conn=conn,
            current_user=current_user,
            namespace=request.namespace,
            min_role=NamespaceRole.EDITOR,
        )
        _validate_pipeline_name_for_paths(request.name)
        home_dir = get_home_dir()
        pipeline_dir = Path(home_dir) / ".docetl" / namespace_value / "pipelines"
        config_dir = pipeline_dir / "configs"
        name_dir = pipeline_dir / request.name / "intermediates"
        
        config_dir.mkdir(parents=True, exist_ok=True)
        name_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = config_dir / f"{request.name}.yaml"
        with file_path.open("w") as f:
            f.write(request.config)
            
        return {
            "filePath": str(file_path),
            "inputPath": request.input_path,
            "outputPath": request.output_path
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to write pipeline configuration: {str(e)}")

@router.get("/read-file")
async def read_file(
    path: str,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Read file contents"""
    try:
        if path.startswith(("http://", "https://")):
            # For HTTP URLs, we'll need to implement request handling
            raise HTTPException(status_code=400, detail="HTTP URLs not supported in this endpoint")
            
        file_path = _authorize_docetl_path(
            conn=conn,
            current_user=current_user,
            path=path,
            min_role=NamespaceRole.VIEWER,
        )
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        return FileResponse(str(file_path))
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@router.get("/read-file-page")
async def read_file_page(
    path: str,
    page: int = 0,
    chunk_size: int = 500000,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Read file contents by page"""
    try:
        file_path = _authorize_docetl_path(
            conn=conn,
            current_user=current_user,
            path=path,
            min_role=NamespaceRole.VIEWER,
        )
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        file_size = file_path.stat().st_size
        start = page * chunk_size
        
        with file_path.open("rb") as f:
            f.seek(start)
            content = f.read(chunk_size).decode("utf-8")
            
        return {
            "content": content,
            "totalSize": file_size,
            "page": page,
            "hasMore": start + len(content) < file_size
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@router.get("/serve-document/{path:path}")
async def serve_document(
    path: str,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Serve document files"""
    try:
        file_path = _authorize_docetl_path(
            conn=conn,
            current_user=current_user,
            path=path,
            min_role=NamespaceRole.VIEWER,
        )
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        return FileResponse(
            path=str(file_path),
            filename=file_path.name,
            headers={"Cache-Control": "public, max-age=3600"}
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to serve file: {str(e)}")

@router.get("/check-file")
async def check_file(
    path: str,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Check if a file exists without reading it"""
    try:
        file_path = _authorize_docetl_path(
            conn=conn,
            current_user=current_user,
            path=path,
            min_role=NamespaceRole.VIEWER,
        )
        exists = file_path.exists()
        return {"exists": exists}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to check file: {str(e)}")
