#include <chrono>
#include <GLFW/glfw3.h>
#include <glad/glad.h>
#include <SFML/Audio/SoundBuffer.hpp>
#include <utilities/shader.hpp>
#include <glm/vec3.hpp>
#include <iostream>
#include <utilities/timeutils.h>
#include <utilities/mesh.h>
#include <utilities/shapes.h>
#include <utilities/glutils.h>
#include <SFML/Audio/Sound.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <fmt/format.h>
#include <cmath>		// sin
#include <algorithm>    // std::max
#include "gamelogic.h"
#include "sceneGraph.hpp"
#include "utilities/camera.hpp"
#define GLM_ENABLE_EXPERIMENTAL
#include <glm/gtx/transform.hpp>
#include "utilities/imageLoader.hpp"
#include "utilities/glfont.h"
#include "texture.hpp"

enum KeyFrameAction {
    BOTTOM, TOP
};

#include <timestamps.h>

double padPositionX = 0;
double padPositionZ = 0;

unsigned int currentKeyFrame = 0;
unsigned int previousKeyFrame = 0;

// These are heap allocated, because they should not be initialised at the start of the program
sf::SoundBuffer* buffer;
Gloom::Shader* shader;
Gloom::Shader* depthShader;
Gloom::Shader* shader2D;
sf::Sound* sound;

CommandLineOptions options;

Gloom::Camera camera(glm::vec3(0.0f, 0.0f, -5.0f));

bool hasStarted = false;
bool hasLost = false;
bool jumpedToNextFrame = false;
bool isPaused = false;

bool mouseLeftPressed   = false;
bool mouseLeftReleased  = false;
bool mouseRightPressed  = false;
bool mouseRightReleased = false;

// Modify if you want the music to start further on in the track. Measured in seconds.
const float debug_startTime = 0;
double totalElapsedTime = debug_startTime;
double gameElapsedTime = debug_startTime;

double mouseSensitivity = 1.0;
double lastMouseX = windowWidth / 2;
double lastMouseY = windowHeight / 2;

std::chrono::steady_clock::time_point startTime = std::chrono::steady_clock::now();

void mouseCallback(GLFWwindow* window, double x, double y)
{
	camera.handleCursorPosInput(x, y);
	glfwSetCursorPos(window, windowWidth / 2, windowHeight / 2);
}

void mouseButtonCallback(GLFWwindow* window, int button, int action, int mods)
{
	camera.handleMouseButtonInputs(button, action);
}

void keyCallback(GLFWwindow* window, int key, int scancode, int action, int mode)
{
	camera.handleKeyboardInputs(key, action);
}

unsigned int const  numLights = 1;
LightSource lightSources[numLights];

SceneNode* rootNode;

void initGame(GLFWwindow* window, CommandLineOptions gameOptions) {
    buffer = new sf::SoundBuffer();
    if (!buffer->loadFromFile("../res/Hall of the Mountain King.ogg")) {
        return;
    }
    options = gameOptions;

	int windowWidth, windowHeight;
	glfwGetWindowSize(window, &windowWidth, &windowHeight);

	// Set up callback functions for input
    glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_HIDDEN);
    glfwSetCursorPosCallback(window,mouseCallback);
	glfwSetMouseButtonCallback(window, mouseButtonCallback);
	glfwSetKeyCallback(window, keyCallback);

	// Create simple shader program
    shader = new Gloom::Shader();
	std::vector<std::string> basicShaderFiles{"../res/shaders/simple.vert", "../res/shaders/simple.frag"};
	shader->makeBasicShader(basicShaderFiles);
    shader->activate();

	unsigned int emptyVAO;
	glGenVertexArrays(1, &emptyVAO);
	glBindVertexArray(emptyVAO);

	// Send image resolution to shader
	glUniform2fv(0, 1, glm::value_ptr(glm::vec2(float(windowWidth), float(windowHeight))));

	rootNode = createSceneNode();

	// Send number of lights to shader
	glUniform1i(4, numLights);
	printf("Lights %i", numLights);

	for (int light = 0; light < numLights; light++) {
		lightSources[light].lightNode = createSceneNode();
		lightSources[light].lightNode->vertexArrayObjectID = light;
		lightSources[light].lightNode->nodeType = POINT_LIGHT;
		//lightSources[light].color[light] = 1.0;
		rootNode->children.push_back(lightSources[light].lightNode);
		lightSources[light].color = glm::vec3(1.0, 1.0, 1.0);
	}

	lightSources[0].lightNode->position = glm::vec3(3.0, -2.0, -7.0);
	//lightSources[1].lightNode->position = glm::vec3(-1.0, -20.0, -5.0);
	//lightSources[2].lightNode->position = glm::vec3(0.0, 2.0, 5.0);

    getTimeDeltaSeconds();

    std::cout << "Ready. Click to start!" << std::endl;
}

void renderNode(SceneNode* node) {
	switch (node->nodeType) {
	case GEOMETRY:
		if (node->vertexArrayObjectID != -1) {
			glBindVertexArray(node->vertexArrayObjectID);
			glActiveTexture(GL_TEXTURE0 + 11);
			glBindTexture(GL_TEXTURE_2D, node->textureID);
			glDrawElements(GL_TRIANGLES, node->VAOIndexCount, GL_UNSIGNED_INT, nullptr);
		}
		break;
	case GEOMETRY_NORMAL_MAPPED:
		if (node->vertexArrayObjectID != -1) {
			// Set conditional flag and bind texture
			glUniform1i(11, 1);
			glBindVertexArray(node->vertexArrayObjectID);
			glActiveTexture(GL_TEXTURE0 + 12);
			glBindTexture(GL_TEXTURE_2D, node->normalMapTextureID);
			glActiveTexture(GL_TEXTURE0 + 11);
			glBindTexture(GL_TEXTURE_2D, node->textureID);
			glDrawElements(GL_TRIANGLES, node->VAOIndexCount, GL_UNSIGNED_INT, nullptr);
			glUniform1i(11, 0);
		}
		break;
	case POINT_LIGHT:
	{
		GLint location_position = shader->getUniformFromName(fmt::format("pointLights[{}].position", node->vertexArrayObjectID));		// Vertex array obj ID = light ID
		glUniform3fv(location_position, 1, glm::value_ptr(lightSources[node->vertexArrayObjectID].worldPos));

		GLint location_color = shader->getUniformFromName(fmt::format("pointLights[{}].color", node->vertexArrayObjectID));
		glUniform3fv(location_color, 1, glm::value_ptr(lightSources[node->vertexArrayObjectID].color));
	}
	break;
	case SPOT_LIGHT: break;
	}

	for (SceneNode* child : node->children) {
		renderNode(child);
	}
}

void updateFrame(GLFWwindow* window) {

    double timeDelta = getTimeDeltaSeconds();
	
	// Send elapsed time to shader
	float elapsedTime = (std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - startTime).count()) / 1000000.0;
	glUniform1f(1, elapsedTime);

	// Update camera and send position to shader
	camera.updateCamera(timeDelta);
	glUniform3fv(2, 1, glm::value_ptr(camera.getPosition()));
	glUniformMatrix4fv(3, 1, GL_FALSE, glm::value_ptr(camera.getRotation()));

	updateNodeTransformations(rootNode, glm::mat4(1.0f), glm::mat4(1.0f));
}

void updateNodeTransformations(SceneNode* node, glm::mat4 transformationThusFar, glm::mat4 viewProjection) {
    glm::mat4 transformationMatrix =
              glm::translate(node->position)
            * glm::translate(node->referencePoint)
            * glm::rotate(node->rotation.y, glm::vec3(0,1,0))
            * glm::rotate(node->rotation.x, glm::vec3(1,0,0))
            * glm::rotate(node->rotation.z, glm::vec3(0,0,1))
            * glm::scale(node->scale)
            * glm::translate(-node->referencePoint);

    node->currentTransformationMatrix = transformationThusFar * transformationMatrix;
	node->MVPMatrix = viewProjection * node->currentTransformationMatrix;

    switch(node->nodeType) {
        case GEOMETRY: break;
		case POINT_LIGHT:
			// Calculating the world coordinates of a light source by multiplying the transformation matrix by the origin of the world space
			glm::vec4 origin = glm::vec4(0, 0, 0, 1.0);
			lightSources[node->vertexArrayObjectID].worldPos = glm::vec3(node->currentTransformationMatrix * origin);
			break;
        case SPOT_LIGHT: break;
    }

    for(SceneNode* child : node->children) {
        updateNodeTransformations(child, node->currentTransformationMatrix, viewProjection);
    }
}

void renderFrame(GLFWwindow* window) {
    int windowWidth, windowHeight;
    glfwGetWindowSize(window, &windowWidth, &windowHeight);
    glViewport(0, 0, windowWidth, windowHeight);

	renderNode(rootNode);

	glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);

	/*
	// Render 3D geometry
    renderNode(rootNode);

	// Render 2D geometry
	shader2D->activate();
	render2DNode(rootNode);
	shader->activate();
	*/
}
