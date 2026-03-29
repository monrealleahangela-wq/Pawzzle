import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader } from 'lucide-react';
import { uploadService, getImageUrl } from '../services/apiService';

const ImageUpload = ({ 
  images = [], 
  onImagesChange, 
  multiple = false, 
  maxFiles = 5,
  label = "Upload Image",
  accept = "image/*"
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files) => {
    const filesArray = Array.from(files);
    
    if (!multiple && filesArray.length > 1) {
      alert('Please upload only one image');
      return;
    }

    if (images.length + filesArray.length > maxFiles) {
      alert(`Maximum ${maxFiles} images allowed`);
      return;
    }

    setUploading(true);

    try {
      const uploadedUrls = [];

      for (const file of filesArray) {
        const formData = new FormData();
        formData.append('image', file);

        const response = await uploadService.uploadImage(formData);
        uploadedUrls.push(response.data.imageUrl);
      }

      const newImages = multiple ? [...images, ...uploadedUrls] : uploadedUrls;
      onImagesChange(newImages);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (indexToRemove) => {
    const newImages = images.filter((_, index) => index !== indexToRemove);
    onImagesChange(newImages);
  };

  const onButtonClick = () => {
    inputRef.current.click();
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {multiple && (
          <span className="text-gray-500 ml-1">
            ({images.length}/{maxFiles})
          </span>
        )}
      </label>

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className={`grid gap-4 ${multiple ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 max-w-xs'}`}>
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <img
                src={getImageUrl(image)}
                alt={`Preview ${index + 1}`}
                className="w-full h-20 object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      {(!multiple || images.length < maxFiles) && (
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragActive 
              ? 'border-primary-500 bg-primary-50' 
              : 'border-gray-300 hover:border-gray-400 bg-gray-50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={onButtonClick}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleChange}
            multiple={multiple}
            disabled={uploading}
          />

          {uploading ? (
            <div className="flex flex-col items-center space-y-2">
              <Loader className="h-8 w-8 text-primary-500 animate-spin" />
              <span className="text-sm text-gray-600">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              {images.length === 0 ? (
                <>
                  <Upload className="h-10 w-10 text-gray-400" />
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-primary-600">Click to upload</span>
                    <span className="mx-1">or</span>
                    <span className="font-medium">drag and drop</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    PNG, JPG, GIF, WEBP up to 5MB
                  </p>
                </>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {multiple ? 'Add more images' : 'Replace image'}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
