#ifndef TEXTURE_HPP
#define TEXTURE_HPP
#pragma once

#include "utilities/imageLoader.hpp"
#include "utilities/lodepng.h"

// System headers
#include <GLFW/glfw3.h>
#include <glad/glad.h>
#include <string>
#include <utilities/window.hpp>



class Texture
{
private:
	unsigned int textureID;
public:
	Texture(PNGImage* image);
	unsigned int getTextureID();
};

#endif
