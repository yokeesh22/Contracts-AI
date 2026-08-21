from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    project_name: str = "Deviation Analyzer"
    environment: str = "local"
    secret_key: str = "changethis"
    first_superuser: str = "admin@ineffa.in"
    first_superuser_password: str = "ineffa@2026"
    backend_cors_origins: str = "http://localhost:5192"

    # Database
    sqlite_db_path: str = "deviation_analyzer.db"

    # Azure Form Recognizer
    fr_endpoint: str = ""
    fr_key: str = ""
    fr_model_id: str = "prebuilt-layout"

    # Azure OpenAI
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "gpt-5.2"
    azure_openai_api_version: str = "2024-12-01-preview"

    # Document processing
    upload_dir: str = "uploads"

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


settings = Settings()
