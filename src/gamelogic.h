#pragma once

#include <utilities/window.hpp>
#include <vector>
#include "sceneGraph.hpp"

//// A few lines to help you if you've never used c++ structs
struct LightSource {
	SceneNode* lightNode;
	glm::vec3 worldPos;
	glm::vec3 color;
};
// LightSource lightSources[/*Put number of light sources you want here*/];

void updateNodeTransformations(SceneNode* node, glm::mat4 transformationThusFar, glm::mat4 viewProjection);
void initGame(GLFWwindow* window);
void updateFrame(GLFWwindow* window);
void renderFrame(GLFWwindow* window);

std::vector<glm::mat4> lightSpaceTransform(glm::mat4 projection, LightSource light);