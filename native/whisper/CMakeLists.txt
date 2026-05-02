cmake_minimum_required(VERSION 3.15)

# cmake-js provides these variables
cmake_policy(SET CMP0091 NEW)
cmake_policy(SET CMP0042 NEW)

project(whisper_addon LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ── whisper.cpp build options ──────────────────────────────────────────────────
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)

# Enable Metal on macOS (Apple Silicon GPU acceleration)
if(APPLE)
  set(GGML_METAL ON CACHE BOOL "" FORCE)
  set(GGML_METAL_EMBED_LIBRARY ON CACHE BOOL "" FORCE)

  # Enable Core ML (Apple Neural Engine) on arm64 — 3x faster encoder vs Metal
  if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
    set(WHISPER_COREML ON CACHE BOOL "" FORCE)
    # Allow Metal GPU fallback when .mlmodelc file is missing
    set(WHISPER_COREML_ALLOW_FALLBACK ON CACHE BOOL "" FORCE)
  endif()
endif()

# Build whisper.cpp as a subdirectory (static library)
add_subdirectory(vendor/whisper.cpp)

# ── N-API addon ────────────────────────────────────────────────────────────────
# cmake-js sets CMAKE_JS_INC and CMAKE_JS_LIB
include_directories(${CMAKE_JS_INC})

file(GLOB ADDON_SOURCES "src/*.cc")

add_library(${PROJECT_NAME} SHARED ${ADDON_SOURCES} ${CMAKE_JS_SRC})

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

target_include_directories(${PROJECT_NAME} PRIVATE
  ${CMAKE_SOURCE_DIR}/vendor/whisper.cpp/include
  ${CMAKE_SOURCE_DIR}/vendor/whisper.cpp/ggml/include
)

target_link_libraries(${PROJECT_NAME} PRIVATE
  whisper
  ${CMAKE_JS_LIB}
)

# node-addon-api (header-only, no-exceptions disabled so we get C++ exceptions)
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})

# Use N-API version 8 for broad compatibility
target_compile_definitions(${PROJECT_NAME} PRIVATE
  NAPI_VERSION=8
)

# macOS-specific linker flags for Metal and Core ML frameworks
if(APPLE)
  target_link_libraries(${PROJECT_NAME} PRIVATE
    "-framework Accelerate"
    "-framework Foundation"
    "-framework Metal"
    "-framework MetalKit"
  )
  if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
    target_link_libraries(${PROJECT_NAME} PRIVATE
      "-framework CoreML"
    )
  endif()
  set_target_properties(${PROJECT_NAME} PROPERTIES
    XCODE_ATTRIBUTE_MACOSX_DEPLOYMENT_TARGET "13.0"
  )
endif()
